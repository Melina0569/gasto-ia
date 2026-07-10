from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import os
import warnings
import io
import base64
warnings.filterwarnings('ignore')

# Get the directory where this script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')
CORS(app)

# ============================================================
# BASE DE DATOS INCORPORADA (Embedded Dataset)
# ============================================================
# Datos históricos de órdenes de compra y servicio del GRA
# Se carga automáticamente al iniciar el servidor.
# ============================================================

EMBEDDED_DATA_PATH = os.path.join(BASE_DIR, 'ordenes-compra-servicio-2026-01.xlsx')

# Global variables to store model state
model_data = {
    'model': None,
    'scaler': None,
    'encoders': {},
    'feature_columns': None,
    'p33': None,
    'p66': None,
    'accuracy': None,
    'include_estado': False,
    'is_trained': False,
    'df_original': None,
    'df_cleaned': None,
    'df_features': None,
    'df_preview': None,
    'column_mappings': None,
    'stats': None,
    'preview_data': None
}

# Column mappings
TIP_DOC_MAPPING = {10: 'Orden de Compra', 20: 'Orden de Servicio'}
OBJ_CONT_MAPPING = {1: 'Bienes', 2: 'Servicios'}
EST_DOC_MAPPING = {2: 'Borrador', 3: 'Anulada / Resoluta', 4: 'Publicada / Conformidad'}


def find_column(df, possible_names):
    """Find a column in the dataframe matching any of the possible names."""
    cols_lower = {col.lower(): col for col in df.columns}
    for name in possible_names:
        if name.lower() in cols_lower:
            return cols_lower[name.lower()]
    return None


def auto_detect_columns(df):
    """Auto-detect columns based on common naming patterns."""
    mappings = {}

    # TIP_DOC detection
    tip_doc = find_column(df, ['TIP_DOC', 'TIPO_DOCUMENTO', 'TIPO_DOC', 'TIPO DE DOCUMENTO', 'DOCUMENTO'])
    if tip_doc:
        mappings['TIP_DOC'] = tip_doc

    # ORG_CONT detection
    org_cont = find_column(df, ['ORG_CONT', 'RUBRO', 'FUENTE_FINANCIAMIENTO', 'FUENTE', 'ORGANISMO'])
    if org_cont:
        mappings['ORG_CONT'] = org_cont

    # OBJ_CONT detection
    obj_cont = find_column(df, ['OBJ_CONT', 'OBJETO_CONTRATACION', 'OBJETO', 'TIPO_OBJETO', 'OBJETO_CONTRATO'])
    if obj_cont:
        mappings['OBJ_CONT'] = obj_cont

    # LST_AOS1 detection
    lst_aos1 = find_column(df, ['LST_AOS1', 'CLASIFICADOR_ECONOMICO', 'CLASIFICADOR', 'PARTIDA', 'ECONOMICO', 'CEG'])
    if lst_aos1:
        mappings['LST_AOS1'] = lst_aos1

    # EST_DOC detection
    est_doc = find_column(df, ['EST_DOC', 'ESTADO_DOCUMENTO', 'ESTADO', 'ESTADO_DOC', 'STATUS'])
    if est_doc:
        mappings['EST_DOC'] = est_doc

    # IMP_MONT detection
    imp_mont = find_column(df, ['IMP_MONT', 'MONTO', 'IMPORTE', 'MONTO_TOTAL', 'MONTO_ADJUDICADO', 'VALOR'])
    if imp_mont:
        mappings['IMP_MONT'] = imp_mont

    return mappings


def clean_data(df, column_mappings):
    """Clean and preprocess the data."""
    df_clean = df.copy()

    # Keep only necessary columns
    cols_to_keep = list(column_mappings.values())
    df_clean = df_clean[cols_to_keep].copy()

    # Rename to standard names
    reverse_mapping = {v: k for k, v in column_mappings.items()}
    df_clean = df_clean.rename(columns=reverse_mapping)

    # Remove rows with missing values in required columns
    required_cols = ['TIP_DOC', 'ORG_CONT', 'OBJ_CONT', 'LST_AOS1', 'IMP_MONT']
    df_clean = df_clean.dropna(subset=required_cols)

    # Convert numeric columns
    numeric_cols = ['TIP_DOC', 'OBJ_CONT', 'IMP_MONT']
    if 'EST_DOC' in df_clean.columns:
        numeric_cols.append('EST_DOC')

    for col in numeric_cols:
        if col in df_clean.columns:
            df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')

    # Remove rows where IMP_MONT is invalid
    df_clean = df_clean[df_clean['IMP_MONT'] > 0]
    df_clean = df_clean.dropna()

    # Convert ORG_CONT and LST_AOS1 to string
    df_clean['ORG_CONT'] = df_clean['ORG_CONT'].astype(str)
    df_clean['LST_AOS1'] = df_clean['LST_AOS1'].astype(str)

    return df_clean


def build_target_variable(df_clean):
    """Build the target variable based on percentiles of IMP_MONT."""
    p33 = df_clean['IMP_MONT'].quantile(0.33)
    p66 = df_clean['IMP_MONT'].quantile(0.66)

    def classify_monto(monto):
        if monto <= p33:
            return 0  # Bajo
        elif monto <= p66:
            return 1  # Medio
        else:
            return 2  # Alto

    df_clean['NIVEL_GASTO'] = df_clean['IMP_MONT'].apply(classify_monto)

    return df_clean, p33, p66


def prepare_features(df_clean, include_estado=False):
    """Prepare features for the neural network."""
    feature_cols = ['TIP_DOC', 'ORG_CONT', 'OBJ_CONT', 'LST_AOS1']
    if include_estado and 'EST_DOC' in df_clean.columns:
        feature_cols.append('EST_DOC')

    X = df_clean[feature_cols].copy()
    y = df_clean['NIVEL_GASTO'].values

    encoders = {}

    # Encode categorical variables
    categorical_cols = ['ORG_CONT', 'LST_AOS1']
    if include_estado and 'EST_DOC' in df_clean.columns:
        categorical_cols.append('EST_DOC')

    for col in categorical_cols:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
        encoders[col] = le

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    return X_scaled, y, feature_cols, encoders, scaler


def train_model(X, y):
    """Train the MLPClassifier neural network."""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # MLPClassifier - Multilayer Perceptron with Backpropagation
    mlp = MLPClassifier(
        hidden_layer_sizes=(128, 64, 32),  # 3 hidden layers
        activation='relu',
        solver='adam',  # Stochastic Gradient Descent-based optimizer
        alpha=0.001,  # L2 regularization
        batch_size='auto',
        learning_rate='adaptive',
        learning_rate_init=0.001,
        max_iter=500,
        shuffle=True,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
        verbose=False
    )

    mlp.fit(X_train, y_train)

    # Evaluate
    y_pred = mlp.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, target_names=['Bajo', 'Medio', 'Alto'], output_dict=True)
    cm = confusion_matrix(y_test, y_pred).tolist()

    # Ensure consistent keys for frontend compatibility
    # Some sklearn versions may use numeric keys instead of target_names
    key_map = {}
    for key in list(report.keys()):
        if key not in ['Bajo', 'Medio', 'Alto', 'macro avg', 'weighted avg', 'accuracy']:
            # Map numeric keys to target names
            if key == '0':
                key_map[key] = 'Bajo'
            elif key == '1':
                key_map[key] = 'Medio'
            elif key == '2':
                key_map[key] = 'Alto'
    for old_key, new_key in key_map.items():
        if new_key not in report:
            report[new_key] = report.pop(old_key)

    return mlp, accuracy, report, cm, X_train, X_test, y_train, y_test


def process_dataset(df):
    """Process a dataset and return preview data and stats."""
    # Auto-detect columns
    column_mappings = auto_detect_columns(df)

    # Check required columns
    required = ['TIP_DOC', 'ORG_CONT', 'OBJ_CONT', 'LST_AOS1', 'IMP_MONT']
    missing = [col for col in required if col not in column_mappings]

    if missing:
        return None, f'Missing required columns: {missing}. Detected: {list(column_mappings.keys())}'

    # Clean data
    df_clean = clean_data(df, column_mappings)

    if len(df_clean) < 10:
        return None, f'Insufficient data after cleaning. Only {len(df_clean)} valid rows found.'

    # Build preview (first 10 rows)
    df_preview = df_clean.head(10).copy()
    df_preview['TIP_DOC_DESC'] = df_preview['TIP_DOC'].map(TIP_DOC_MAPPING)
    df_preview['OBJ_CONT_DESC'] = df_preview['OBJ_CONT'].map(OBJ_CONT_MAPPING)

    preview_data = []
    for _, row in df_preview.iterrows():
        preview_data.append({
            'TIP_DOC': int(row['TIP_DOC']),
            'TIP_DOC_DESC': row.get('TIP_DOC_DESC', ''),
            'ORG_CONT': str(row['ORG_CONT']),
            'OBJ_CONT': int(row['OBJ_CONT']),
            'OBJ_CONT_DESC': row.get('OBJ_CONT_DESC', ''),
            'LST_AOS1': str(row['LST_AOS1']),
            'IMP_MONT': float(row['IMP_MONT']),
            'EST_DOC': int(row['EST_DOC']) if 'EST_DOC' in row and pd.notna(row['EST_DOC']) else None
        })

    # Build target for preview
    df_with_target, p33, p66 = build_target_variable(df_clean.copy())

    # Stats
    stats = {
        'total_rows': len(df),
        'cleaned_rows': len(df_clean),
        'removed_rows': len(df) - len(df_clean),
        'p33': round(float(p33), 2),
        'p66': round(float(p66), 2),
        'min_monto': round(float(df_clean['IMP_MONT'].min()), 2),
        'max_monto': round(float(df_clean['IMP_MONT'].max()), 2),
        'mean_monto': round(float(df_clean['IMP_MONT'].mean()), 2),
        'nivel_counts': {
            'bajo': int((df_with_target['NIVEL_GASTO'] == 0).sum()),
            'medio': int((df_with_target['NIVEL_GASTO'] == 1).sum()),
            'alto': int((df_with_target['NIVEL_GASTO'] == 2).sum())
        },
        'has_estado': 'EST_DOC' in df_clean.columns,
        'detected_columns': list(df.columns),
        'mapped_columns': column_mappings
    }

    return {
        'df_original': df.copy(),
        'df_cleaned': df_clean,
        'column_mappings': column_mappings,
        'preview': preview_data,
        'stats': stats
    }, None


def load_embedded_data():
    """Load the embedded dataset from the Excel file."""
    try:
        if not os.path.exists(EMBEDDED_DATA_PATH):
            print(f"  ❌ Archivo embebido no encontrado: {EMBEDDED_DATA_PATH}")
            return False

        print(f"  📂 Cargando base de datos incorporada...")
        df = pd.read_excel(EMBEDDED_DATA_PATH)

        # Remove header row if it's duplicated as data
        if str(df.iloc[0].get('COD_ENT', '')) == 'COD_ENT':
            df = df.iloc[1:].reset_index(drop=True)

        result, error = process_dataset(df)

        if error:
            print(f"  ❌ Error procesando datos embebidos: {error}")
            return False

        model_data['df_original'] = result['df_original']
        model_data['df_cleaned'] = result['df_cleaned']
        model_data['column_mappings'] = result['column_mappings']
        model_data['stats'] = result['stats']
        model_data['preview_data'] = result['preview']

        print(f"  ✅ Base de datos cargada: {result['stats']['cleaned_rows']} registros válidos")
        print(f"  📊 Percentiles: P33=S/.{result['stats']['p33']} | P66=S/.{result['stats']['p66']}")
        return True

    except Exception as e:
        print(f"  ❌ Error cargando datos embebidos: {str(e)}")
        return False


# ============================================================
# FLASK ROUTES
# ============================================================

@app.route('/')
def index():
    """Serve the index.html file directly from the same directory."""
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/styles.css')
def serve_css():
    return send_from_directory(BASE_DIR, 'styles.css')


@app.route('/script.js')
def serve_js():
    return send_from_directory(BASE_DIR, 'script.js')


# ============================================================
# API: Datos Incorporados (Embedded Data)
# ============================================================

@app.route('/api/data-info', methods=['GET'])
def data_info():
    """Return information about the embedded dataset."""
    if model_data['df_cleaned'] is None:
        return jsonify({'error': 'No hay datos cargados'}), 400

    return jsonify({
        'success': True,
        'preview': model_data['preview_data'],
        'stats': model_data['stats'],
        'source': 'Base de datos histórica incorporada',
        'filename': 'ordenes-compra-servicio-2026-01.xlsx'
    })


# ============================================================
# API: Administración (Admin Section - Optional)
# ============================================================

@app.route('/api/admin/upload', methods=['POST'])
def admin_upload():
    """Admin endpoint to upload a new dataset and replace the embedded one."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400

        # Read file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file, encoding='utf-8')
        elif file.filename.endswith('.xlsx') or file.filename.endswith('.xls'):
            df = pd.read_excel(file)
        else:
            return jsonify({'error': 'Unsupported file format. Use .csv or .xlsx'}), 400

        result, error = process_dataset(df)

        if error:
            return jsonify({
                'error': error,
                'detected_columns': list(df.columns)
            }), 400

        # Store in model_data
        model_data['df_original'] = result['df_original']
        model_data['df_cleaned'] = result['df_cleaned']
        model_data['column_mappings'] = result['column_mappings']
        model_data['stats'] = result['stats']
        model_data['preview_data'] = result['preview']

        # Reset model state since data changed
        model_data['model'] = None
        model_data['scaler'] = None
        model_data['encoders'] = {}
        model_data['feature_columns'] = None
        model_data['p33'] = None
        model_data['p66'] = None
        model_data['accuracy'] = None
        model_data['include_estado'] = False
        model_data['is_trained'] = False
        model_data['df_features'] = None

        return jsonify({
            'success': True,
            'message': f'Dataset actualizado: {result["stats"]["cleaned_rows"]} registros válidos',
            'preview': result['preview'],
            'stats': result['stats']
        })

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/api/admin/reset', methods=['POST'])
def admin_reset():
    """Reset to the original embedded dataset."""
    success = load_embedded_data()
    if success:
        # Reset model state
        model_data['model'] = None
        model_data['scaler'] = None
        model_data['encoders'] = {}
        model_data['feature_columns'] = None
        model_data['p33'] = None
        model_data['p66'] = None
        model_data['accuracy'] = None
        model_data['include_estado'] = False
        model_data['is_trained'] = False
        model_data['df_features'] = None

        return jsonify({
            'success': True,
            'message': 'Base de datos restaurada a la versión original',
            'stats': model_data['stats']
        })
    else:
        return jsonify({'error': 'No se pudo restaurar la base de datos original'}), 500


# ============================================================
# API: Entrenamiento (Training)
# ============================================================

@app.route('/api/train', methods=['POST'])
def train():
    try:
        data = request.get_json() or {}
        include_estado = data.get('include_estado', False)

        if model_data['df_cleaned'] is None:
            return jsonify({'error': 'No hay datos cargados.'}), 400

        df_clean = model_data['df_cleaned'].copy()

        # Build target
        df_with_target, p33, p66 = build_target_variable(df_clean)

        # Check if EST_DOC exists when requested
        if include_estado and 'EST_DOC' not in df_with_target.columns:
            return jsonify({'error': 'EST_DOC column not found in dataset. Cannot include estado.'}), 400

        # Prepare features
        X, y, feature_cols, encoders, scaler = prepare_features(df_with_target, include_estado)

        # Train model
        mlp, accuracy, report, cm, X_train, X_test, y_train, y_test = train_model(X, y)

        # Store model state
        model_data['model'] = mlp
        model_data['scaler'] = scaler
        model_data['encoders'] = encoders
        model_data['feature_columns'] = feature_cols
        model_data['p33'] = p33
        model_data['p66'] = p66
        model_data['accuracy'] = accuracy
        model_data['include_estado'] = include_estado
        model_data['is_trained'] = True
        model_data['df_features'] = df_with_target

        # Training history
        history = {
            'loss_curve': [round(x, 6) for x in mlp.loss_curve_],
            'n_iterations': mlp.n_iter_,
            'n_layers': mlp.n_layers_,
            'n_outputs': mlp.n_outputs_,
            'classes': mlp.classes_.tolist()
        }

        # Model architecture info
        architecture = {
            'hidden_layers': list(mlp.hidden_layer_sizes),
            'activation': mlp.activation,
            'solver': mlp.solver,
            'alpha': mlp.alpha,
            'learning_rate': mlp.learning_rate,
            'max_iter': mlp.max_iter,
            'early_stopping': mlp.early_stopping,
            'input_features': feature_cols,
            'n_features': X.shape[1],
            'n_samples': X.shape[0]
        }

        return jsonify({
            'success': True,
            'accuracy': round(accuracy * 100, 2),
            'classification_report': report,
            'confusion_matrix': cm,
            'percentiles': {
                'p33': round(float(p33), 2),
                'p66': round(float(p66), 2)
            },
            'nivel_counts': {
                'bajo': int((df_with_target['NIVEL_GASTO'] == 0).sum()),
                'medio': int((df_with_target['NIVEL_GASTO'] == 1).sum()),
                'alto': int((df_with_target['NIVEL_GASTO'] == 2).sum())
            },
            'history': history,
            'architecture': architecture,
            'include_estado': include_estado
        })

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


# ============================================================
# API: Predicción (Prediction)
# ============================================================

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        if not model_data['is_trained']:
            return jsonify({'error': 'Model not trained yet. Please train the model first.'}), 400

        data = request.get_json()

        tip_doc = int(data.get('TIP_DOC'))
        org_cont = str(data.get('ORG_CONT'))
        obj_cont = int(data.get('OBJ_CONT'))
        lst_aos1 = str(data.get('LST_AOS1'))

        # Build input features
        features = {
            'TIP_DOC': tip_doc,
            'ORG_CONT': org_cont,
            'OBJ_CONT': obj_cont,
            'LST_AOS1': lst_aos1
        }

        if model_data['include_estado']:
            est_doc = int(data.get('EST_DOC', 4))
            features['EST_DOC'] = est_doc

        # Create DataFrame
        input_df = pd.DataFrame([features])

        # Encode categorical variables
        for col, encoder in model_data['encoders'].items():
            if col in input_df.columns:
                val = str(input_df[col].iloc[0])
                # Handle unseen categories
                if val in encoder.classes_:
                    input_df[col] = encoder.transform([val])[0]
                else:
                    # Use the most frequent class
                    input_df[col] = 0

        # Ensure columns match training
        input_df = input_df[model_data['feature_columns']]

        # Scale
        X_input = model_data['scaler'].transform(input_df)

        # Predict
        prediction = model_data['model'].predict(X_input)[0]
        probabilities = model_data['model'].predict_proba(X_input)[0]

        nivel_names = {0: 'Bajo', 1: 'Medio', 2: 'Alto'}
        nivel_colors = {0: 'success', 1: 'warning', 2: 'danger'}

        result = {
            'success': True,
            'prediction': int(prediction),
            'prediction_label': nivel_names[int(prediction)],
            'probabilities': {
                'bajo': round(float(probabilities[0]) * 100, 2),
                'medio': round(float(probabilities[1]) * 100, 2),
                'alto': round(float(probabilities[2]) * 100, 2)
            },
            'confidence': round(float(probabilities[int(prediction)]) * 100, 2),
            'percentiles': {
                'p33': round(float(model_data['p33']), 2),
                'p66': round(float(model_data['p66']), 2)
            },
            'actual_nivel': None,
            'actual_label': None,
            'input_data': features
        }

        return jsonify(result)

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


# ============================================================
# API: Información del Modelo (Model Info)
# ============================================================

@app.route('/api/model-info', methods=['GET'])
def model_info():
    if not model_data['is_trained']:
        return jsonify({'error': 'Model not trained'}), 400

    mlp = model_data['model']

    return jsonify({
        'success': True,
        'architecture': {
            'hidden_layers': list(mlp.hidden_layer_sizes),
            'activation': mlp.activation,
            'solver': mlp.solver,
            'alpha': mlp.alpha,
            'learning_rate': mlp.learning_rate,
            'max_iter': mlp.max_iter,
            'early_stopping': mlp.early_stopping,
            'input_features': model_data['feature_columns'],
            'n_features': len(model_data['feature_columns']),
            'n_samples': model_data['df_features'].shape[0] if model_data['df_features'] is not None else 0
        },
        'accuracy': round(model_data['accuracy'] * 100, 2) if model_data['accuracy'] else 0,
        'percentiles': {
            'p33': round(float(model_data['p33']), 2),
            'p66': round(float(model_data['p66']), 2)
        },
        'include_estado': model_data['include_estado']
    })


@app.route('/api/clear', methods=['POST'])
def clear_data():
    """Clear model state but keep the embedded data."""
    model_data['model'] = None
    model_data['scaler'] = None
    model_data['encoders'] = {}
    model_data['feature_columns'] = None
    model_data['p33'] = None
    model_data['p66'] = None
    model_data['accuracy'] = None
    model_data['include_estado'] = False
    model_data['is_trained'] = False
    model_data['df_features'] = None

    return jsonify({'success': True, 'message': 'Model state cleared. Data preserved.'})


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    print("=" * 60)
    print("  SISTEMA INTELIGENTE DE PREDICCIÓN DE GASTO")
    print("  Gobierno Regional de Arequipa")
    print("=" * 60)
    print(f"  Directorio base: {BASE_DIR}")
    print("  Archivos detectados:")
    for f in ['index.html', 'styles.css', 'script.js', 'ordenes-compra-servicio-2026-01.xlsx']:
        path = os.path.join(BASE_DIR, f)
        status = "✅" if os.path.exists(path) else "❌"
        print(f"    {status} {f}")
    print("=" * 60)

    # Load embedded data automatically
    print("  🔄 Cargando base de datos incorporada automáticamente...")
    load_embedded_data()

    print("=" * 60)
    print("  Iniciando servidor en: http://localhost:5000")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)