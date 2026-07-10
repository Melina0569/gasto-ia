/**
 * SISTEMA INTELIGENTE DE PREDICCIÓN DE GASTO
 * Gobierno Regional de Arequipa
 * Frontend JavaScript - Versión con Base de Datos Incorporada
 */

// ============================================
// STATE
// ============================================

const state = {
    dataLoaded: false,
    modelTrained: false,
    includeEstado: false,
    fileName: 'ordenes-compra-servicio-2026-01.xlsx',
    stats: null
};

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
    // Data section
    dataStatus: document.getElementById('dataStatus'),
    dataPreviewSection: document.getElementById('dataPreviewSection'),
    previewTableBody: document.getElementById('previewTableBody'),
    previewRowCount: document.getElementById('previewRowCount'),
    dataStatsSection: document.getElementById('dataStatsSection'),
    statTotalRows: document.getElementById('statTotalRows'),
    statCleanedRows: document.getElementById('statCleanedRows'),
    statRemovedRows: document.getElementById('statRemovedRows'),
    statP33: document.getElementById('statP33'),
    statP66: document.getElementById('statP66'),
    statMean: document.getElementById('statMean'),
    barBajo: document.getElementById('barBajo'),
    barMedio: document.getElementById('barMedio'),
    barAlto: document.getElementById('barAlto'),
    countBajo: document.getElementById('countBajo'),
    countMedio: document.getElementById('countMedio'),
    countAlto: document.getElementById('countAlto'),
    // Training
    includeEstadoSwitch: document.getElementById('includeEstadoSwitch'),
    btnTrain: document.getElementById('btnTrain'),
    trainingResults: document.getElementById('trainingResults'),
    // Prediction
    predEstDocContainer: document.getElementById('predEstDocContainer'),
    predictionForm: document.getElementById('predictionForm'),
    btnPredict: document.getElementById('btnPredict'),
    predictionResult: document.getElementById('predictionResult'),
    // Admin
    adminNavLink: document.getElementById('adminNavLink'),
    adminUploadArea: document.getElementById('adminUploadArea'),
    adminFileInput: document.getElementById('adminFileInput'),
    adminUploadProgress: document.getElementById('adminUploadProgress'),
    adminProgressCircle: document.getElementById('adminProgressCircle'),
    adminProgressText: document.getElementById('adminProgressText'),
    btnResetData: document.getElementById('btnResetData'),
    adminResults: document.getElementById('adminResults'),
    adminResultMessage: document.getElementById('adminResultMessage'),
    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initNeuralConnections();
    initDataLoading();
    initTraining();
    initPrediction();
    initAdmin();
    initSmoothScroll();
    initNavbarScroll();

    // Initial EST_DOC visibility: hidden by default until trained with include_estado
    elements.predEstDocContainer.style.display = 'none';
    document.getElementById('predEstDoc').required = false;
});

// ============================================
// PARTICLES
// ============================================

function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        container.appendChild(particle);
    }
}

// ============================================
// NEURAL NETWORK CONNECTIONS
// ============================================

function initNeuralConnections() {
    const svg = document.getElementById('nnConnections');
    if (!svg) return;

    const container = document.querySelector('.nn-container');
    if (!container) return;

    const layers = container.querySelectorAll('.nn-layer');
    const connections = [];

    // Simple connection drawing between layers
    for (let i = 0; i < layers.length - 1; i++) {
        const currentNodes = layers[i].querySelectorAll('.nn-node');
        const nextNodes = layers[i + 1].querySelectorAll('.nn-node');

        currentNodes.forEach((fromNode, fromIdx) => {
            nextNodes.forEach((toNode, toIdx) => {
                if (Math.random() > 0.3) { // Don't draw all connections for performance
                    connections.push({ from: fromNode, to: toNode });
                }
            });
        });
    }

    // Draw connections
    const containerRect = container.getBoundingClientRect();

    connections.forEach(conn => {
        const fromRect = conn.from.getBoundingClientRect();
        const toRect = conn.to.getBoundingClientRect();

        const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
        const x2 = toRect.left + toRect.width / 2 - containerRect.left;
        const y2 = toRect.top + toRect.height / 2 - containerRect.top;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', 'rgba(133, 248, 196, 0.2)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    });
}

// ============================================
// SMOOTH SCROLL
// ============================================

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                // Show admin section if navigating to admin
                if (this.getAttribute('href') === '#admin') {
                    document.getElementById('admin').classList.remove('d-none');
                }
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ============================================
// NAVBAR SCROLL
// ============================================

function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');

    window.addEventListener('scroll', () => {
        // Navbar background
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(0, 105, 72, 0.98)';
        } else {
            navbar.style.background = 'rgba(0, 105, 72, 0.95)';
        }

        // Active section
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            if (window.scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    });
}

// ============================================
// DATA LOADING (Embedded Dataset)
// ============================================

async function initDataLoading() {
    try {
        elements.dataStatus.textContent = 'Cargando...';
        elements.dataStatus.className = 'text-warning';

        const response = await fetch('/api/data-info');
        const data = await response.json();

        if (data.success) {
            state.dataLoaded = true;
            state.stats = data.stats;

            elements.dataStatus.textContent = 'Cargada ✅';
            elements.dataStatus.className = 'text-success fw-bold';

            showDataPreview(data.preview, data.stats);
            showToast('Éxito', `Base de datos cargada: ${data.stats.cleaned_rows} registros válidos`, 'success');
            elements.btnTrain.disabled = false;
        } else {
            elements.dataStatus.textContent = 'Error ❌';
            elements.dataStatus.className = 'text-danger';
            showToast('Error', data.error || 'Error al cargar datos', 'danger');
        }
    } catch (error) {
        elements.dataStatus.textContent = 'Error ❌';
        elements.dataStatus.className = 'text-danger';
        showToast('Error', 'Error de conexión con el servidor', 'danger');
        console.error(error);
    }
}

function showDataPreview(preview, stats) {
    // Fill preview table
    const tbody = elements.previewTableBody;
    tbody.innerHTML = '';

    preview.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'fade-in-up';
        tr.style.animationDelay = (idx * 0.05) + 's';
        tr.innerHTML = `
            <td><span class="badge bg-primary">${row.TIP_DOC}</span></td>
            <td>${row.TIP_DOC_DESC}</td>
            <td><code>${row.ORG_CONT}</code></td>
            <td><span class="badge bg-warning">${row.OBJ_CONT}</span></td>
            <td>${row.OBJ_CONT_DESC}</td>
            <td><code>${row.LST_AOS1}</code></td>
            <td><strong>S/. ${formatNumber(row.IMP_MONT)}</strong></td>
            <td>${row.EST_DOC !== null ? `<span class="badge bg-secondary">${row.EST_DOC}</span>` : '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    elements.previewRowCount.textContent = `${preview.length} filas (vista previa)`;

    // Fill stats
    elements.statTotalRows.textContent = formatNumber(stats.total_rows);
    elements.statCleanedRows.textContent = formatNumber(stats.cleaned_rows);
    elements.statRemovedRows.textContent = formatNumber(stats.removed_rows);
    elements.statP33.textContent = 'S/. ' + formatNumber(stats.p33);
    elements.statP66.textContent = 'S/. ' + formatNumber(stats.p66);
    elements.statMean.textContent = 'S/. ' + formatNumber(stats.mean_monto);

    // Fill nivel bars
    const total = stats.nivel_counts.bajo + stats.nivel_counts.medio + stats.nivel_counts.alto;
    const pctBajo = (stats.nivel_counts.bajo / total * 100).toFixed(1);
    const pctMedio = (stats.nivel_counts.medio / total * 100).toFixed(1);
    const pctAlto = (stats.nivel_counts.alto / total * 100).toFixed(1);

    elements.barBajo.style.width = pctBajo + '%';
    elements.barMedio.style.width = pctMedio + '%';
    elements.barAlto.style.width = pctAlto + '%';

    elements.countBajo.textContent = stats.nivel_counts.bajo + ' (' + pctBajo + '%)';
    elements.countMedio.textContent = stats.nivel_counts.medio + ' (' + pctMedio + '%)';
    elements.countAlto.textContent = stats.nivel_counts.alto + ' (' + pctAlto + '%)';
}

// ============================================
// TRAINING
// ============================================

function initTraining() {
    const { includeEstadoSwitch, btnTrain } = elements;

    includeEstadoSwitch.addEventListener('change', (e) => {
        state.includeEstado = e.target.checked;
        // Update EST_DOC field visibility in prediction form
        if (state.includeEstado) {
            elements.predEstDocContainer.style.display = 'block';
            document.getElementById('predEstDoc').required = true;
        } else {
            elements.predEstDocContainer.style.display = 'none';
            document.getElementById('predEstDoc').required = false;
        }
    });

    btnTrain.addEventListener('click', trainModel);
}

async function trainModel() {
    const { btnTrain, trainingResults, includeEstadoSwitch } = elements;

    if (!state.dataLoaded) {
        showToast('Error', 'Los datos no están cargados. Espere un momento...', 'danger');
        return;
    }

    btnTrain.disabled = true;
    btnTrain.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Entrenando...';

    // Show training progress UI
    trainingResults.innerHTML = createTrainingProgressHTML();

    try {
        const response = await fetch('/api/train', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ include_estado: state.includeEstado })
        });

        const data = await response.json();

        if (data.success) {
            state.modelTrained = true;
            showTrainingResults(data);
            elements.btnPredict.disabled = false;

            // Show/hide EST_DOC in prediction form
            if (state.includeEstado) {
                elements.predEstDocContainer.style.display = 'block';
                document.getElementById('predEstDoc').required = true;
            } else {
                elements.predEstDocContainer.style.display = 'none';
                document.getElementById('predEstDoc').required = false;
            }

            showToast('Éxito', `Modelo entrenado con ${data.accuracy}% de precisión`, 'success');
        } else {
            showToast('Error', data.error || 'Error en el entrenamiento', 'danger');
            trainingResults.innerHTML = createResultsEmptyHTML();
        }

    } catch (error) {
        showToast('Error', 'Error de conexión con el servidor', 'danger');
        trainingResults.innerHTML = createResultsEmptyHTML();
        console.error(error);
    } finally {
        btnTrain.disabled = false;
        btnTrain.innerHTML = '<i class="fas fa-play me-2"></i>Entrenar Red Neuronal';
    }
}

function createTrainingProgressHTML() {
    return `
        <div class="training-progress">
            <div class="progress-header">
                <h5><i class="fas fa-brain me-2"></i>Entrenando Red Neuronal</h5>
                <div class="training-status">
                    <span class="status-dot"></span>
                    <span>Procesando Backpropagation...</span>
                </div>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: 100%"></div>
            </div>
            <div class="training-metrics">
                <div class="metric-box">
                    <div class="metric-value">-</div>
                    <div class="metric-label">Precisión</div>
                </div>
                <div class="metric-box">
                    <div class="metric-value">-</div>
                    <div class="metric-label">Iteraciones</div>
                </div>
                <div class="metric-box">
                    <div class="metric-value">-</div>
                    <div class="metric-label">Pérdida Final</div>
                </div>
            </div>
            <p class="text-muted text-center">
                <i class="fas fa-info-circle me-1"></i>
                El modelo está aplicando el algoritmo de Backpropagation con optimizador Adam...
            </p>
        </div>
    `;
}

function createResultsEmptyHTML() {
    return `
        <div class="results-empty">
            <div class="empty-icon">
                <i class="fas fa-brain"></i>
            </div>
            <h5>Modelo No Entrenado</h5>
            <p>Presione "Entrenar Red Neuronal" para comenzar el proceso de Backpropagation con los datos históricos incorporados.</p>
        </div>
    `;
}

function showTrainingResults(data) {
    const { trainingResults } = elements;

    const report = data.classification_report;
    const cm = data.confusion_matrix;
    const history = data.history;
    const arch = data.architecture;

    // Build loss curve SVG
    const lossCurveSVG = buildLossCurveSVG(history.loss_curve);

    trainingResults.innerHTML = `
        <div class="results-display">
            <div class="results-header">
                <h5><i class="fas fa-check-circle me-2 text-success"></i>Entrenamiento Completado</h5>
                <span class="accuracy-badge">${data.accuracy}% Accuracy</span>
            </div>

            <div class="row g-4">
                <div class="col-md-6">
                    <div class="confusion-matrix">
                        <h6><i class="fas fa-th me-2"></i>Matriz</h6>
                        <table class="cm-table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Pred: Bajo</th>
                                    <th>Pred: Medio</th>
                                    <th>Pred: Alto</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <th>Real: Bajo</th>
                                    <td class="diagonal">${cm[0][0]}</td>
                                    <td>${cm[0][1]}</td>
                                    <td>${cm[0][2]}</td>
                                </tr>
                                <tr>
                                    <th>Real: Medio</th>
                                    <td>${cm[1][0]}</td>
                                    <td class="diagonal">${cm[1][1]}</td>
                                    <td>${cm[1][2]}</td>
                                </tr>
                                <tr>
                                    <th>Real: Alto</th>
                                    <td>${cm[2][0]}</td>
                                    <td>${cm[2][1]}</td>
                                    <td class="diagonal">${cm[2][2]}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="col-md-6">
                    <div class="classification-report">
                        <h6><i class="fas fa-chart-bar me-2"></i>Reporte de Clasificación</h6>
                        <div class="table-responsive">
                            <table class="cr-table">
                                <thead>
                                    <tr>
                                        <th>Clase</th>
                                        <th>Presición</th>
                                        <th>Sensibilidad</th>
                                        <th>F1-Score</th>
                                        <th>Registros</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><span class="badge bg-success">Bajo</span></td>
                                        <td>${(report['Bajo']['precision'] * 100).toFixed(1)}%</td>
                                        <td>${(report['Bajo']['recall'] * 100).toFixed(1)}%</td>
                                        <td>${(report['Bajo']['f1-score'] * 100).toFixed(1)}%</td>
                                        <td>${report['Bajo']['support']}</td>
                                    </tr>
                                    <tr>
                                        <td><span class="badge bg-warning">Medio</span></td>
                                        <td>${(report['Medio']['precision'] * 100).toFixed(1)}%</td>
                                        <td>${(report['Medio']['recall'] * 100).toFixed(1)}%</td>
                                        <td>${(report['Medio']['f1-score'] * 100).toFixed(1)}%</td>
                                        <td>${report['Medio']['support']}</td>
                                    </tr>
                                    <tr>
                                        <td><span class="badge bg-danger">Alto</span></td>
                                        <td>${(report['Alto']['precision'] * 100).toFixed(1)}%</td>
                                        <td>${(report['Alto']['recall'] * 100).toFixed(1)}%</td>
                                        <td>${(report['Alto']['f1-score'] * 100).toFixed(1)}%</td>
                                        <td>${report['Alto']['support']}</td>
                                    </tr>
                                    <tr style="border-top: 2px solid var(--surface-variant); font-weight: 700;">
                                        <td>Promedio</td>
                                        <td>${(report['macro avg']['precision'] * 100).toFixed(1)}%</td>
                                        <td>${(report['macro avg']['recall'] * 100).toFixed(1)}%</td>
                                        <td>${(report['macro avg']['f1-score'] * 100).toFixed(1)}%</td>
                                        <td>${report['macro avg']['support']}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div class="loss-curve">
                <h6><i class="fas fa-chart-line me-2"></i>Curva de Aprendizaje del Modelo</h6>
                <div class="loss-chart">
                    ${lossCurveSVG}
                </div>
            </div>

            <div class="mt-4 p-3 bg-light rounded-3">
                <h6 class="mb-2"><i class="fas fa-cogs me-2"></i>Arquitectura del Modelo</h6>
                <div class="row g-2">
                    <div class="col-md-3"><strong>Variables analizadas:</strong> ${arch.input_features.join(', ')}</div>
                    <div class="col-md-3"><strong>Muestras:</strong> ${arch.n_samples}</div>
                    <div class="col-md-3"><strong>N° de variables analizadas:</strong> ${arch.n_features}</div>
                </div>
                <div class="row g-2 mt-1">
                    <div class="col-md-3"><strong>Regularización:</strong> α=${arch.alpha}</div>
                    <div class="col-md-3"><strong>N° de iteraciones:</strong> ${arch.max_iter}</div>
                </div>
            </div>
        </div>
    `;

    // Scroll to results
    setTimeout(() => {
        trainingResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}

function buildLossCurveSVG(lossCurve) {
    if (!lossCurve || lossCurve.length === 0) return '';

    const width = 600;
    const height = 200;
    const padding = 30;

    const maxLoss = Math.max(...lossCurve);
    const minLoss = Math.min(...lossCurve);
    const range = maxLoss - minLoss || 1;

    const points = lossCurve.map((loss, i) => {
        const x = padding + (i / (lossCurve.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((loss - minLoss) / range) * (height - 2 * padding);
        return `${x},${y}`;
    }).join(' ');

    return `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="lossGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:rgba(0,105,72,0.3)" />
                    <stop offset="100%" style="stop-color:rgba(0,105,72,0)" />
                </linearGradient>
            </defs>
            <polyline points="${points}" fill="none" stroke="#006948" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polygon points="${padding},${height-padding} ${points} ${width-padding},${height-padding}" fill="url(#lossGradient)"/>
            <text x="${padding}" y="${height-10}" font-size="10" fill="#6d7a72">0</text>
            <text x="${width-padding-20}" y="${height-10}" font-size="10" fill="#6d7a72">${lossCurve.length}</text>
            <text x="10" y="${padding}" font-size="10" fill="#6d7a72">${maxLoss.toFixed(4)}</text>
            <text x="10" y="${height-padding}" font-size="10" fill="#6d7a72">${minLoss.toFixed(4)}</text>
        </svg>
    `;
}

// ============================================
// PREDICTION
// ============================================

function initPrediction() {
    const { predictionForm } = elements;

    predictionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await makePrediction();
    });
}

async function makePrediction() {
    const { btnPredict, predictionResult } = elements;

    if (!state.modelTrained) {
        showToast('Error', 'Primero entrene el modelo', 'danger');
        return;
    }

    const formData = {
        TIP_DOC: parseInt(document.getElementById('predTipDoc').value),
        ORG_CONT: document.getElementById('predOrgCont').value,
        OBJ_CONT: parseInt(document.getElementById('predObjCont').value),
        LST_AOS1: document.getElementById('predLstAos1').value
    };

    if (state.includeEstado) {
        formData.EST_DOC = parseInt(document.getElementById('predEstDoc').value);
    }

    btnPredict.disabled = true;
    btnPredict.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Analizando...';

    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            showPredictionResult(data);
            showToast('Éxito', 'Predicción completada', 'success');
        } else {
            showToast('Error', data.error || 'Error en la predicción', 'danger');
        }

    } catch (error) {
        showToast('Error', 'Error de conexión con el servidor', 'danger');
        console.error(error);
    } finally {
        btnPredict.disabled = false;
        btnPredict.innerHTML = '<i class="fas fa-magic me-2"></i>Ejecutar Predicción';
    }
}

function showPredictionResult(data) {
    const { predictionResult } = elements;

    predictionResult.classList.remove('d-none');

    const nivelConfig = {
        0: { label: 'Bajo', text: 'Gasto Bajo', icon: 'fa-arrow-down', color: 'bajo' },
        1: { label: 'Medio', text: 'Gasto Medio', icon: 'fa-minus', color: 'medio' },
        2: { label: 'Alto', text: 'Gasto Alto', icon: 'fa-arrow-up', color: 'alto' }
    };

    const config = nivelConfig[data.prediction];

    // Update nivel display
    const nivelIcon = document.getElementById('resultNivelIcon');
    const nivelText = document.getElementById('resultNivelText');
    const nivelBadge = document.getElementById('resultNivelBadge');

    nivelIcon.innerHTML = `<i class="fas ${config.icon}"></i>`;
    nivelIcon.className = `nivel-icon ${config.color}`;
    nivelText.textContent = config.text;
    nivelBadge.textContent = config.label;
    nivelBadge.className = `nivel-badge ${config.color}`;

    // Update confidence
    document.getElementById('resultConfidence').textContent = data.confidence + '%';
    document.getElementById('resultConfidenceBar').style.width = data.confidence + '%';

    // Update probabilities
    document.getElementById('probBajo').style.width = data.probabilities.bajo + '%';
    document.getElementById('probBajoValue').textContent = data.probabilities.bajo + '%';
    document.getElementById('probMedio').style.width = data.probabilities.medio + '%';
    document.getElementById('probMedioValue').textContent = data.probabilities.medio + '%';
    document.getElementById('probAlto').style.width = data.probabilities.alto + '%';
    document.getElementById('probAltoValue').textContent = data.probabilities.alto + '%';

    // Actual comparison - hidden since IMP_MONT is not an input variable
    const actualComparison = document.getElementById('actualComparison');
    actualComparison.classList.add('d-none');

    // Scroll to result
    setTimeout(() => {
        predictionResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
}

// ============================================
// ADMIN SECTION
// ============================================

function initAdmin() {
    const { adminUploadArea, adminFileInput, btnResetData } = elements;

    // Drag & Drop for admin
    adminUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        adminUploadArea.classList.add('dragover');
    });

    adminUploadArea.addEventListener('dragleave', () => {
        adminUploadArea.classList.remove('dragover');
    });

    adminUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        adminUploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleAdminFileUpload(files[0]);
        }
    });

    adminUploadArea.addEventListener('click', () => {
        adminFileInput.click();
    });

    adminFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleAdminFileUpload(e.target.files[0]);
        }
    });

    // Reset button
    btnResetData.addEventListener('click', async () => {
        if (!confirm('¿Está seguro de restaurar la base de datos original? Se perderá cualquier modelo entrenado.')) {
            return;
        }

        btnResetData.disabled = true;
        btnResetData.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Restaurando...';

        try {
            const response = await fetch('/api/admin/reset', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                state.modelTrained = false;
                state.dataLoaded = true;
                state.stats = data.stats;
                elements.btnPredict.disabled = true;
                elements.trainingResults.innerHTML = createResultsEmptyHTML();

                // Reload data preview
                await initDataLoading();

                showAdminResult(data.message);
                showToast('Éxito', 'Base de datos restaurada correctamente', 'success');
            } else {
                showToast('Error', data.error || 'Error al restaurar', 'danger');
            }
        } catch (error) {
            showToast('Error', 'Error de conexión', 'danger');
        } finally {
            btnResetData.disabled = false;
            btnResetData.innerHTML = '<i class="fas fa-undo me-2"></i>Restaurar Base de Datos Original';
        }
    });
}

async function handleAdminFileUpload(file) {
    const { adminUploadProgress, adminProgressCircle, adminProgressText } = elements;

    // Validate file type
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(ext)) {
        showToast('Error', 'Formato no válido. Use .csv o .xlsx', 'danger');
        return;
    }

    // Show progress
    adminUploadProgress.classList.remove('d-none');

    const formData = new FormData();
    formData.append('file', file);

    try {
        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            updateAdminProgress(progress);
        }, 200);

        const response = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);
        updateAdminProgress(100);

        const data = await response.json();

        setTimeout(() => {
            adminUploadProgress.classList.add('d-none');

            if (data.success) {
                state.dataLoaded = true;
                state.modelTrained = false;
                state.stats = data.stats;
                state.fileName = file.name;

                // Reset training state
                elements.btnPredict.disabled = true;
                elements.trainingResults.innerHTML = createResultsEmptyHTML();

                // Reload data preview
                showDataPreview(data.preview, data.stats);
                elements.dataStatus.textContent = 'Actualizada ✅';

                showAdminResult(`Base actualizada: ${data.stats.cleaned_rows} registros de "${file.name}"`);
                showToast('Éxito', `Dataset actualizado: ${data.stats.cleaned_rows} registros válidos`, 'success');
                elements.btnTrain.disabled = false;
            } else {
                showToast('Error', data.error || 'Error al procesar el archivo', 'danger');
            }
        }, 500);

    } catch (error) {
        adminUploadProgress.classList.add('d-none');
        showToast('Error', 'Error de conexión con el servidor', 'danger');
        console.error(error);
    }
}

function updateAdminProgress(percent) {
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (percent / 100) * circumference;
    elements.adminProgressCircle.style.strokeDashoffset = offset;
    elements.adminProgressText.textContent = Math.round(percent) + '%';
}

function showAdminResult(message) {
    elements.adminResults.classList.remove('d-none');
    elements.adminResultMessage.textContent = message;
}

// ============================================
// UTILITIES
// ============================================

function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(title, message, type = 'info') {
    const { toastContainer } = elements;

    const toastId = 'toast-' + Date.now();

    const iconMap = {
        success: 'fa-check-circle',
        danger: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const colorMap = {
        success: 'text-success',
        danger: 'text-danger',
        warning: 'text-warning',
        info: 'text-primary'
    };

    const toastHTML = `
        <div class="toast custom-toast" id="${toastId}" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="5000">
            <div class="toast-header">
                <i class="fas ${iconMap[type]} ${colorMap[type]} me-2"></i>
                <strong class="me-auto">${title}</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}