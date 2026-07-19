// app.js — Guarida: gestión de mascotas
'use strict';

/* ---------- Estado y persistencia ---------- */

const STORAGE_KEY = 'guarida_v1';
const BACKUP_FLAG_KEY = 'guarida_last_backup';

const state = {
  mascotas: [],
  comprasComida: [],
  vacunas: [],
  tratamientos: [], // desparasitación / antipulgas
  medicamentos: [],
  visitasVet: [],
  gastosExtra: [], // accesorios, peluquería, otros
  eventos: [], // bitácora
  nextId: 1
};

function nuevoId() {
  return state.nextId++;
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cargar() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.assign(state, data);
  } catch (e) {
    console.error('Error al cargar datos', e);
  }
}

/* ---------- Utilidades ---------- */

function formatoGs(monto) {
  return '₲ ' + Math.round(monto).toLocaleString('es-PY');
}

function formatoFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function edadEnMeses(nacimientoISO) {
  if (!nacimientoISO) return null;
  const nac = new Date(nacimientoISO + 'T00:00:00');
  const ahora = new Date();
  let meses = (ahora.getFullYear() - nac.getFullYear()) * 12 + (ahora.getMonth() - nac.getMonth());
  if (ahora.getDate() < nac.getDate()) meses--;
  return Math.max(meses, 0);
}

function edadTexto(nacimientoISO) {
  const meses = edadEnMeses(nacimientoISO);
  if (meses == null) return 'Edad desconocida';
  if (meses < 1) return 'Menos de 1 mes';
  if (meses < 24) return `${meses} mes${meses === 1 ? '' : 'es'}`;
  const años = Math.floor(meses / 12);
  const restoMeses = meses % 12;
  return restoMeses > 0 ? `${años} años, ${restoMeses} m` : `${años} años`;
}

function pesoActual(mascota) {
  if (!mascota.pesos || mascota.pesos.length === 0) return null;
  return mascota.pesos[mascota.pesos.length - 1].peso;
}

function diasHasta(iso) {
  if (!iso) return null;
  const hoy = new Date(hoyISO() + 'T00:00:00');
  const objetivo = new Date(iso + 'T00:00:00');
  return Math.round((objetivo - hoy) / 86400000);
}

function leerArchivoComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Comprime una imagen a un ancho máximo para no inflar localStorage
function comprimirImagen(dataUrl, maxAncho = 640, calidad = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxAncho / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * escala;
      canvas.height = img.height * escala;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', calidad));
    };
    img.src = dataUrl;
  });
}

/* ---------- Navegación entre pestañas ---------- */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('activo'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('activo'));
      btn.classList.add('activo');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('activo');
      renderAll();
    });
  });
}

/* ---------- Render: Dashboard ---------- */

function renderDashboard() {
  const cont = document.getElementById('dashboard-alertas');
  const alertas = [];

  // Vacunas y tratamientos próximos (30 días) o vencidos
  const proximos = [];
  state.vacunas.forEach(v => {
    if (!v.proximaFecha) return;
    proximos.push({ tipo: 'Vacuna', nombre: v.nombre, fecha: v.proximaFecha, petId: v.mascotaId });
  });
  state.tratamientos.forEach(t => {
    if (!t.proximaFecha) return;
    proximos.push({ tipo: t.tipo, nombre: t.producto || t.tipo, fecha: t.proximaFecha, petId: t.mascotaId });
  });
  state.medicamentos.forEach(m => {
    if (!m.fechaFin) return;
    const dias = diasHasta(m.fechaFin);
    if (dias !== null && dias >= -3 && dias <= 30) {
      proximos.push({ tipo: 'Medicamento (fin)', nombre: m.nombre, fecha: m.fechaFin, petId: m.mascotaId });
    }
  });

  proximos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  proximos.forEach(p => {
    const dias = diasHasta(p.fecha);
    const mascota = state.mascotas.find(m => m.id === p.petId);
    const nombreMascota = mascota ? mascota.nombre : '—';
    if (dias === null) return;
    if (dias < 0) {
      alertas.push({ clase: 'vencido', texto: `${p.tipo} de ${nombreMascota} — ${p.nombre}: vencido hace ${Math.abs(dias)} día(s)` });
    } else if (dias <= 30) {
      alertas.push({ clase: dias <= 7 ? 'proximo' : 'futuro', texto: `${p.tipo} de ${nombreMascota} — ${p.nombre}: en ${dias} día(s) (${formatoFecha(p.fecha)})` });
    }
  });

  // Stock de comida bajo
  const stock = calcularStockComida();
  if (stock.diasRestantes !== null && stock.diasRestantes <= 10) {
    alertas.push({ clase: stock.diasRestantes <= 3 ? 'vencido' : 'proximo', texto: `Comida general: quedan ~${stock.diasRestantes} día(s) de stock` });
  }

  // Días especiales próximos (cumpleaños / aniversario de llegada) en 14 días
  state.mascotas.filter(m => m.activo).forEach(m => {
    ['nacimiento', 'llegada'].forEach(campo => {
      const fecha = m[campo];
      if (!fecha) return;
      const prox = proximaFechaAnual(fecha);
      const dias = diasHasta(prox);
      if (dias !== null && dias <= 14) {
        const label = campo === 'nacimiento' ? 'Cumpleaños' : 'Aniversario de llegada';
        alertas.push({ clase: 'especial', texto: `${label} de ${m.nombre}: en ${dias} día(s) (${formatoFecha(prox)})` });
      }
    });
  });

  cont.innerHTML = alertas.length
    ? alertas.map(a => `<div class="alerta alerta-${a.clase}">${a.texto}</div>`).join('')
    : '<div class="vacio">Sin pendientes próximos. Todo al día.</div>';

  // Resumen de mascotas activas
  const resumen = document.getElementById('dashboard-resumen');
  const activas = state.mascotas.filter(m => m.activo);
  resumen.innerHTML = activas.length
    ? activas.map(m => tarjetaMascotaResumen(m)).join('')
    : '<div class="vacio">Todavía no agregaste ninguna mascota. Andá a la pestaña Mascotas para empezar.</div>';

  // Gasto del mes
  const gastoMes = calcularGastoMes();
  document.getElementById('dashboard-gasto-mes').textContent = formatoGs(gastoMes);
}

function proximaFechaAnual(fechaISO) {
  const original = new Date(fechaISO + 'T00:00:00');
  const hoy = new Date(hoyISO() + 'T00:00:00');
  let candidato = new Date(hoy.getFullYear(), original.getMonth(), original.getDate());
  if (candidato < hoy) candidato = new Date(hoy.getFullYear() + 1, original.getMonth(), original.getDate());
  return candidato.toISOString().slice(0, 10);
}

function tarjetaMascotaResumen(m) {
  const foto = m.foto
    ? `<img src="${m.foto}" class="mini-foto" alt="${m.nombre}">`
    : `<div class="mini-foto mini-foto-vacia">${(m.especie === 'gato' ? '🐱' : m.especie === 'perro' ? '🐶' : '🐾')}</div>`;
  return `<div class="tarjeta-mascota-mini">
    ${foto}
    <div>
      <div class="tm-nombre">${m.nombre}</div>
      <div class="tm-detalle">${edadTexto(m.nacimiento)} · ${pesoActual(m) ? pesoActual(m) + ' kg' : 'sin peso registrado'}</div>
    </div>
  </div>`;
}

/* ---------- Render: Mascotas ---------- */

function renderMascotas() {
  const cont = document.getElementById('lista-mascotas');
  const activas = state.mascotas.filter(m => m.activo);
  cont.innerHTML = activas.length
    ? activas.map(tarjetaMascotaCompleta).join('')
    : '<div class="vacio">No hay mascotas activas. Tocá "Agregar mascota" para comenzar.</div>';

  const archivadas = state.mascotas.filter(m => !m.activo);
  const contArch = document.getElementById('lista-mascotas-archivadas');
  contArch.innerHTML = archivadas.length
    ? archivadas.map(tarjetaMascotaCompleta).join('')
    : '<div class="vacio">Sin mascotas archivadas.</div>';

  document.getElementById('archivadas-detalle').open = false;
}

function tarjetaMascotaCompleta(m) {
  const foto = m.foto
    ? `<img src="${m.foto}" class="foto-mascota" alt="${m.nombre}">`
    : `<div class="foto-mascota foto-vacia">${(m.especie === 'gato' ? '🐱' : m.especie === 'perro' ? '🐶' : '🐾')}</div>`;
  const peso = pesoActual(m);
  const tamano = peso ? calcularTamano(m.especie, peso) : null;

  return `<div class="card-mascota" data-id="${m.id}">
    <div class="card-mascota-header">
      ${foto}
      <div class="card-mascota-info">
        <h3>${m.nombre} ${!m.activo ? '<span class="etiqueta-archivada">Archivada</span>' : ''}</h3>
        <div class="detalle-linea">${m.especie === 'perro' ? 'Perro' : m.especie === 'gato' ? 'Gato' : 'Otro'}${m.raza ? ' · ' + m.raza : ''}${tamano ? ' · Talla ' + tamano : ''}</div>
        <div class="detalle-linea">${edadTexto(m.nacimiento)} · Llegó: ${formatoFecha(m.llegada)}</div>
        <div class="detalle-linea">${m.sexo === 'macho' ? 'Macho' : m.sexo === 'hembra' ? 'Hembra' : ''}${m.esterilizado ? ' · Esterilizado/a' : ''}</div>
      </div>
    </div>
    ${m.descripcion ? `<p class="descripcion">${escaparHtml(m.descripcion)}</p>` : ''}
    <div class="card-mascota-acciones">
      <button class="btn-secundario" onclick="abrirModalPeso(${m.id})">Registrar peso</button>
      <button class="btn-secundario" onclick="abrirModalMascota(${m.id})">Editar</button>
      <button class="btn-secundario" onclick="verRecomendaciones(${m.id})">Recomendaciones</button>
      ${m.activo
        ? `<button class="btn-peligro" onclick="archivarMascota(${m.id})">Archivar</button>`
        : `<button class="btn-secundario" onclick="reactivarMascota(${m.id})">Reactivar</button>`}
    </div>
  </div>`;
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

/* ---------- Modal Mascota (agregar/editar) ---------- */

let fotoTemporal = null;

function abrirModalMascota(id) {
  const modal = document.getElementById('modal-mascota');
  const form = document.getElementById('form-mascota');
  form.reset();
  fotoTemporal = null;
  document.getElementById('preview-foto').innerHTML = '';
  document.getElementById('form-mascota-id').value = '';

  if (id) {
    const m = state.mascotas.find(x => x.id === id);
    document.getElementById('modal-mascota-titulo').textContent = 'Editar mascota';
    document.getElementById('form-mascota-id').value = m.id;
    document.getElementById('m-nombre').value = m.nombre;
    document.getElementById('m-especie').value = m.especie;
    document.getElementById('m-raza').value = m.raza || '';
    document.getElementById('m-sexo').value = m.sexo || '';
    document.getElementById('m-nacimiento').value = m.nacimiento || '';
    document.getElementById('m-nacimiento-estimado').checked = !!m.nacimientoEstimado;
    document.getElementById('m-llegada').value = m.llegada || '';
    document.getElementById('m-esterilizado').checked = !!m.esterilizado;
    document.getElementById('m-microchip').value = m.microchip || '';
    document.getElementById('m-descripcion').value = m.descripcion || '';
    if (m.foto) {
      fotoTemporal = m.foto;
      document.getElementById('preview-foto').innerHTML = `<img src="${m.foto}">`;
    }
  } else {
    document.getElementById('modal-mascota-titulo').textContent = 'Agregar mascota';
  }
  modal.classList.add('abierto');
}

function cerrarModalMascota() {
  document.getElementById('modal-mascota').classList.remove('abierto');
}

async function onFotoSeleccionada(e) {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await leerArchivoComoDataURL(file);
  const comprimida = await comprimirImagen(dataUrl);
  fotoTemporal = comprimida;
  document.getElementById('preview-foto').innerHTML = `<img src="${comprimida}">`;
}

function guardarMascota(e) {
  e.preventDefault();
  const id = document.getElementById('form-mascota-id').value;
  const datos = {
    nombre: document.getElementById('m-nombre').value.trim(),
    especie: document.getElementById('m-especie').value,
    raza: document.getElementById('m-raza').value.trim(),
    sexo: document.getElementById('m-sexo').value,
    nacimiento: document.getElementById('m-nacimiento').value || null,
    nacimientoEstimado: document.getElementById('m-nacimiento-estimado').checked,
    llegada: document.getElementById('m-llegada').value || null,
    esterilizado: document.getElementById('m-esterilizado').checked,
    microchip: document.getElementById('m-microchip').value.trim(),
    descripcion: document.getElementById('m-descripcion').value.trim(),
    foto: fotoTemporal
  };

  if (id) {
    const m = state.mascotas.find(x => x.id === Number(id));
    Object.assign(m, datos);
  } else {
    state.mascotas.push({ id: nuevoId(), activo: true, pesos: [], ...datos });
  }
  guardar();
  cerrarModalMascota();
  renderAll();
}

function archivarMascota(id) {
  if (!confirm('¿Archivar esta mascota? Se guardará todo su historial, solo dejará de aparecer como activa.')) return;
  const m = state.mascotas.find(x => x.id === id);
  m.activo = false;
  m.fechaArchivado = hoyISO();
  guardar();
  renderAll();
}

function reactivarMascota(id) {
  const m = state.mascotas.find(x => x.id === id);
  m.activo = true;
  delete m.fechaArchivado;
  guardar();
  renderAll();
}

/* ---------- Modal Peso ---------- */

function abrirModalPeso(id) {
  document.getElementById('form-peso-id').value = id;
  document.getElementById('p-fecha').value = hoyISO();
  document.getElementById('p-peso').value = '';
  renderHistorialPeso(id);
  document.getElementById('modal-peso').classList.add('abierto');
}

function cerrarModalPeso() {
  document.getElementById('modal-peso').classList.remove('abierto');
}

function renderHistorialPeso(id) {
  const m = state.mascotas.find(x => x.id === id);
  const cont = document.getElementById('historial-peso');
  if (!m.pesos || m.pesos.length === 0) {
    cont.innerHTML = '<div class="vacio">Sin registros todavía.</div>';
    return;
  }
  const ordenado = [...m.pesos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  cont.innerHTML = ordenado.map(p => `<div class="fila-historial">${formatoFecha(p.fecha)} — ${p.peso} kg</div>`).join('');
}

function guardarPeso(e) {
  e.preventDefault();
  const id = Number(document.getElementById('form-peso-id').value);
  const m = state.mascotas.find(x => x.id === id);
  const fecha = document.getElementById('p-fecha').value;
  const peso = parseFloat(document.getElementById('p-peso').value);
  if (!fecha || !peso) return;
  if (!m.pesos) m.pesos = [];
  m.pesos = m.pesos.filter(p => p.fecha !== fecha);
  m.pesos.push({ fecha, peso });
  m.pesos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  guardar();
  renderHistorialPeso(id);
  document.getElementById('p-peso').value = '';
  renderAll();
}

/* ---------- Recomendaciones ---------- */

function verRecomendaciones(id) {
  const m = state.mascotas.find(x => x.id === id);
  const peso = pesoActual(m);
  const especie = m.especie in RECOMENDACIONES ? m.especie : 'otro';
  const base = RECOMENDACIONES[especie];
  const tamano = peso ? calcularTamano(especie, peso) : null;
  const edadMeses = edadEnMeses(m.nacimiento);
  const etapa = calcularEtapa(especie, edadMeses);

  let html = `<h3>${m.nombre} — Recomendaciones (${base.etiqueta}${tamano ? ', talla ' + tamano : ''})</h3>`;
  html += '<p class="nota-disclaimer">Guía general orientativa. Ante cualquier duda de salud, siempre consultá con un veterinario.</p>';

  if (base.vacunas.length) {
    html += '<h4>Vacunas</h4><ul>' + base.vacunas.map(v => `<li><strong>${v.nombre}:</strong> ${v.esquema}</li>`).join('') + '</ul>';
  }
  if (base.desparasitacion) {
    html += `<h4>Desparasitación</h4><ul>
      <li><strong>Cachorro/a:</strong> ${base.desparasitacion.cachorro}</li>
      <li><strong>Adulto/a:</strong> ${base.desparasitacion.adulto}</li>
    </ul>`;
  }
  if (base.antipulgasGarrapatas) {
    html += `<h4>Antipulgas / garrapatas</h4><p>${base.antipulgasGarrapatas}</p>`;
  }

  const alim = base.alimentacion[etapa];
  if (alim) {
    html += `<h4>Alimentación (etapa: ${etapa})</h4><p>Aproximadamente ${alim.pctPesoMin}%–${alim.pctPesoMax}% del peso corporal por día. ${alim.nota}</p>`;
    if (peso) {
      const min = (peso * 1000 * alim.pctPesoMin / 100).toFixed(0);
      const max = (peso * 1000 * alim.pctPesoMax / 100).toFixed(0);
      html += `<p class="calculo-destacado">Con ${peso} kg actuales: ~${min}–${max} g de alimento por día.</p>`;
    } else {
      html += '<p class="vacio">Registrá un peso para calcular la ración estimada en gramos.</p>';
    }
  }

  if (tamano && base.tipsPorTamano[tamano] && base.tipsPorTamano[tamano].length) {
    html += `<h4>Consejos por talla (${tamano})</h4><ul>` + base.tipsPorTamano[tamano].map(t => `<li>${t}</li>`).join('') + '</ul>';
  }

  const razaClave = (m.raza || '').trim().toLowerCase();
  const razaInfo = base.razas[razaClave];
  if (razaInfo && razaInfo.tips.length) {
    html += `<h4>Consejos específicos de raza (${m.raza})</h4><ul>` + razaInfo.tips.map(t => `<li>${t}</li>`).join('') + '</ul>';
  } else if (m.raza) {
    html += `<p class="vacio">No hay consejos específicos cargados para "${m.raza}". Se muestran los generales por especie y talla.</p>`;
  }

  document.getElementById('modal-recomendaciones-contenido').innerHTML = html;
  document.getElementById('modal-recomendaciones').classList.add('abierto');
}

function cerrarModalRecomendaciones() {
  document.getElementById('modal-recomendaciones').classList.remove('abierto');
}

/* ---------- Comida ---------- */

function calcularStockComida() {
  const compras = [...state.comprasComida].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (compras.length === 0) return { kgRestantes: 0, diasRestantes: null };

  const totalComprado = compras.reduce((s, c) => s + c.kg, 0);
  const primera = compras[0].fecha;
  const diasTranscurridos = Math.max(1, Math.round((new Date(hoyISO()) - new Date(primera)) / 86400000));

  // Consumo diario estimado a partir de las recomendaciones de las mascotas activas que comen alimento general
  const consumoDiarioG = state.mascotas.filter(m => m.activo && m.comeComidaGeneral !== false).reduce((s, m) => {
    const peso = pesoActual(m);
    if (!peso) return s;
    const especie = m.especie in RECOMENDACIONES ? m.especie : 'otro';
    const base = RECOMENDACIONES[especie];
    const etapa = calcularEtapa(especie, edadEnMeses(m.nacimiento));
    const alim = base.alimentacion[etapa];
    if (!alim) return s;
    const pctMedio = (alim.pctPesoMin + alim.pctPesoMax) / 2;
    return s + (peso * 1000 * pctMedio / 100);
  }, 0);

  const totalComidoEstimado = compras.reduce((s, c) => {
    const diasDesdeCompra = Math.max(0, Math.round((new Date(hoyISO()) - new Date(c.fecha)) / 86400000));
    return s;
  }, 0);

  // Estimación simple: kg comprados menos (consumo diario × días desde la primera compra)
  const kgConsumidosEstimados = (consumoDiarioG / 1000) * diasTranscurridos;
  const kgRestantes = Math.max(0, totalComprado - kgConsumidosEstimados);
  const diasRestantes = consumoDiarioG > 0 ? Math.round((kgRestantes * 1000) / consumoDiarioG) : null;

  return { kgRestantes: kgRestantes.toFixed(1), diasRestantes, consumoDiarioG: consumoDiarioG.toFixed(0) };
}

function renderComida() {
  const stock = calcularStockComida();
  document.getElementById('stock-comida-resumen').innerHTML = `
    <div class="stat-grande">${stock.kgRestantes} kg</div>
    <div class="detalle-linea">restantes estimados${stock.diasRestantes !== null ? ' · ~' + stock.diasRestantes + ' días' : ''}</div>
    ${stock.consumoDiarioG ? `<div class="detalle-linea">Consumo diario estimado: ${stock.consumoDiarioG} g entre todas las mascotas activas</div>` : ''}
  `;

  const cont = document.getElementById('lista-compras-comida');
  const ordenado = [...state.comprasComida].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  cont.innerHTML = ordenado.length
    ? ordenado.map(c => `<div class="fila-lista">
        <div>
          <div class="fila-titulo">${escaparHtml(c.marca)} — ${c.kg} kg</div>
          <div class="detalle-linea">${formatoFecha(c.fecha)} · ${formatoGs(c.costo)}</div>
        </div>
        <button class="btn-icono" onclick="eliminarCompraComida(${c.id})">✕</button>
      </div>`).join('')
    : '<div class="vacio">Sin compras registradas.</div>';
}

function guardarCompraComida(e) {
  e.preventDefault();
  const marca = document.getElementById('cc-marca').value.trim();
  const kg = parseFloat(document.getElementById('cc-kg').value);
  const costo = parseFloat(document.getElementById('cc-costo').value);
  const fecha = document.getElementById('cc-fecha').value || hoyISO();
  if (!marca || !kg || !costo) return;
  state.comprasComida.push({ id: nuevoId(), marca, kg, costo, fecha });
  guardar();
  document.getElementById('form-compra-comida').reset();
  document.getElementById('cc-fecha').value = hoyISO();
  renderAll();
}

function eliminarCompraComida(id) {
  if (!confirm('¿Eliminar esta compra?')) return;
  state.comprasComida = state.comprasComida.filter(c => c.id !== id);
  guardar();
  renderAll();
}

/* ---------- Salud ---------- */

function selectMascotasHtml(idSeleccionado) {
  return state.mascotas.filter(m => m.activo).map(m =>
    `<option value="${m.id}" ${idSeleccionado === m.id ? 'selected' : ''}>${m.nombre}</option>`
  ).join('');
}

function renderSalud() {
  ['sel-vacuna-mascota', 'sel-tratamiento-mascota', 'sel-medicamento-mascota', 'sel-visita-mascota'].forEach(idSel => {
    const el = document.getElementById(idSel);
    const actual = el.value;
    el.innerHTML = selectMascotasHtml();
    if (actual) el.value = actual;
  });

  renderListaSalud('vacunas', document.getElementById('lista-vacunas'), v =>
    `<div class="fila-titulo">${escaparHtml(v.nombre)}</div>
     <div class="detalle-linea">${nombreMascota(v.mascotaId)} · Aplicada: ${formatoFecha(v.fecha)}${v.proximaFecha ? ' · Próxima: ' + formatoFecha(v.proximaFecha) : ''}</div>`
  );

  renderListaSalud('tratamientos', document.getElementById('lista-tratamientos'), t =>
    `<div class="fila-titulo">${t.tipo}${t.producto ? ' — ' + escaparHtml(t.producto) : ''}</div>
     <div class="detalle-linea">${nombreMascota(t.mascotaId)} · Aplicado: ${formatoFecha(t.fecha)}${t.proximaFecha ? ' · Próximo: ' + formatoFecha(t.proximaFecha) : ''}</div>`
  );

  renderListaSalud('medicamentos', document.getElementById('lista-medicamentos'), m =>
    `<div class="fila-titulo">${escaparHtml(m.nombre)}${m.dosis ? ' — ' + escaparHtml(m.dosis) : ''}</div>
     <div class="detalle-linea">${nombreMascota(m.mascotaId)} · ${formatoFecha(m.fechaInicio)} → ${m.fechaFin ? formatoFecha(m.fechaFin) : 'en curso'}</div>
     ${m.notas ? `<div class="detalle-linea">${escaparHtml(m.notas)}</div>` : ''}`
  );

  renderListaSalud('visitasVet', document.getElementById('lista-visitas'), v =>
    `<div class="fila-titulo">${escaparHtml(v.motivo)}</div>
     <div class="detalle-linea">${nombreMascota(v.mascotaId)} · ${formatoFecha(v.fecha)}${v.veterinario ? ' · ' + escaparHtml(v.veterinario) : ''} · ${formatoGs(v.costo || 0)}</div>
     ${v.diagnostico ? `<div class="detalle-linea">${escaparHtml(v.diagnostico)}</div>` : ''}`
  );
}

function nombreMascota(id) {
  const m = state.mascotas.find(x => x.id === id);
  return m ? m.nombre : '—';
}

function renderListaSalud(clave, cont, plantilla) {
  const items = [...state[clave]].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  cont.innerHTML = items.length
    ? items.map(item => `<div class="fila-lista">
        <div>${plantilla(item)}</div>
        <button class="btn-icono" onclick="eliminarSalud('${clave}', ${item.id})">✕</button>
      </div>`).join('')
    : '<div class="vacio">Sin registros.</div>';
}

function eliminarSalud(clave, id) {
  if (!confirm('¿Eliminar este registro?')) return;
  state[clave] = state[clave].filter(x => x.id !== id);
  guardar();
  renderAll();
}

function guardarVacuna(e) {
  e.preventDefault();
  state.vacunas.push({
    id: nuevoId(),
    mascotaId: Number(document.getElementById('sel-vacuna-mascota').value),
    nombre: document.getElementById('v-nombre').value.trim(),
    fecha: document.getElementById('v-fecha').value || hoyISO(),
    proximaFecha: document.getElementById('v-proxima').value || null
  });
  guardar();
  document.getElementById('form-vacuna').reset();
  renderAll();
}

function guardarTratamiento(e) {
  e.preventDefault();
  state.tratamientos.push({
    id: nuevoId(),
    mascotaId: Number(document.getElementById('sel-tratamiento-mascota').value),
    tipo: document.getElementById('t-tipo').value,
    producto: document.getElementById('t-producto').value.trim(),
    fecha: document.getElementById('t-fecha').value || hoyISO(),
    proximaFecha: document.getElementById('t-proxima').value || null
  });
  guardar();
  document.getElementById('form-tratamiento').reset();
  renderAll();
}

function guardarMedicamento(e) {
  e.preventDefault();
  state.medicamentos.push({
    id: nuevoId(),
    mascotaId: Number(document.getElementById('sel-medicamento-mascota').value),
    nombre: document.getElementById('med-nombre').value.trim(),
    dosis: document.getElementById('med-dosis').value.trim(),
    fechaInicio: document.getElementById('med-inicio').value || hoyISO(),
    fechaFin: document.getElementById('med-fin').value || null,
    notas: document.getElementById('med-notas').value.trim()
  });
  guardar();
  document.getElementById('form-medicamento').reset();
  renderAll();
}

function guardarVisita(e) {
  e.preventDefault();
  const costo = parseFloat(document.getElementById('vv-costo').value) || 0;
  state.visitasVet.push({
    id: nuevoId(),
    mascotaId: Number(document.getElementById('sel-visita-mascota').value),
    fecha: document.getElementById('vv-fecha').value || hoyISO(),
    motivo: document.getElementById('vv-motivo').value.trim(),
    diagnostico: document.getElementById('vv-diagnostico').value.trim(),
    veterinario: document.getElementById('vv-veterinario').value.trim(),
    costo
  });
  guardar();
  document.getElementById('form-visita').reset();
  renderAll();
}

/* ---------- Gastos ---------- */

function calcularGastoMes(offsetMeses = 0) {
  const ahora = new Date();
  const objetivo = new Date(ahora.getFullYear(), ahora.getMonth() + offsetMeses, 1);
  const mismClave = (fechaStr) => {
    const f = new Date(fechaStr);
    return f.getFullYear() === objetivo.getFullYear() && f.getMonth() === objetivo.getMonth();
  };
  let total = 0;
  state.comprasComida.forEach(c => { if (mismClave(c.fecha)) total += c.costo; });
  state.visitasVet.forEach(v => { if (mismClave(v.fecha)) total += (v.costo || 0); });
  state.gastosExtra.forEach(g => { if (mismClave(g.fecha)) total += g.monto; });
  return total;
}

function renderGastos() {
  const cont = document.getElementById('lista-gastos-extra');
  const ordenado = [...state.gastosExtra].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  cont.innerHTML = ordenado.length
    ? ordenado.map(g => `<div class="fila-lista">
        <div>
          <div class="fila-titulo">${escaparHtml(g.descripcion)} — ${formatoGs(g.monto)}</div>
          <div class="detalle-linea">${g.categoria} · ${formatoFecha(g.fecha)}${g.mascotaId ? ' · ' + nombreMascota(g.mascotaId) : ' · Compartido'}</div>
        </div>
        <button class="btn-icono" onclick="eliminarGastoExtra(${g.id})">✕</button>
      </div>`).join('')
    : '<div class="vacio">Sin gastos adicionales registrados.</div>';

  const sel = document.getElementById('sel-gasto-mascota');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Compartido / general</option>' + selectMascotasHtml();
  if (actual) sel.value = actual;

  renderResumenGastos();
}

function renderResumenGastos() {
  const cont = document.getElementById('resumen-gastos-categorias');
  const porCategoria = {};
  let totalGeneral = 0;

  const registrar = (cat, monto) => {
    porCategoria[cat] = (porCategoria[cat] || 0) + monto;
    totalGeneral += monto;
  };

  state.comprasComida.forEach(c => registrar('Comida', c.costo));
  state.visitasVet.forEach(v => registrar('Salud (visitas)', v.costo || 0));
  state.gastosExtra.forEach(g => registrar(g.categoria, g.monto));

  cont.innerHTML = Object.keys(porCategoria).length
    ? Object.entries(porCategoria)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, monto]) => `<div class="fila-lista">
            <div class="fila-titulo">${cat}</div>
            <div>${formatoGs(monto)}</div>
          </div>`).join('') + `<div class="fila-lista fila-total"><div class="fila-titulo">Total histórico</div><div>${formatoGs(totalGeneral)}</div></div>`
    : '<div class="vacio">Sin datos de gastos todavía.</div>';
}

function guardarGastoExtra(e) {
  e.preventDefault();
  const monto = parseFloat(document.getElementById('ge-monto').value);
  if (!monto) return;
  state.gastosExtra.push({
    id: nuevoId(),
    categoria: document.getElementById('ge-categoria').value,
    descripcion: document.getElementById('ge-descripcion').value.trim(),
    monto,
    fecha: document.getElementById('ge-fecha').value || hoyISO(),
    mascotaId: document.getElementById('sel-gasto-mascota').value ? Number(document.getElementById('sel-gasto-mascota').value) : null
  });
  guardar();
  document.getElementById('form-gasto-extra').reset();
  document.getElementById('ge-fecha').value = hoyISO();
  renderAll();
}

function eliminarGastoExtra(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  state.gastosExtra = state.gastosExtra.filter(g => g.id !== id);
  guardar();
  renderAll();
}

/* ---------- Bitácora ---------- */

function renderBitacora() {
  const sel = document.getElementById('sel-evento-mascota');
  const actual = sel.value;
  sel.innerHTML = '<option value="">General</option>' + selectMascotasHtml();
  if (actual) sel.value = actual;

  const cont = document.getElementById('lista-eventos');
  const ordenado = [...state.eventos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  cont.innerHTML = ordenado.length
    ? ordenado.map(ev => `<div class="fila-lista">
        <div>
          <div class="fila-titulo">${formatoFecha(ev.fecha)}${ev.mascotaId ? ' · ' + nombreMascota(ev.mascotaId) : ''}</div>
          <div class="detalle-linea">${escaparHtml(ev.nota)}</div>
        </div>
        <button class="btn-icono" onclick="eliminarEvento(${ev.id})">✕</button>
      </div>`).join('')
    : '<div class="vacio">Sin anotaciones todavía.</div>';
}

function guardarEvento(e) {
  e.preventDefault();
  const nota = document.getElementById('ev-nota').value.trim();
  if (!nota) return;
  state.eventos.push({
    id: nuevoId(),
    fecha: document.getElementById('ev-fecha').value || hoyISO(),
    mascotaId: document.getElementById('sel-evento-mascota').value ? Number(document.getElementById('sel-evento-mascota').value) : null,
    nota
  });
  guardar();
  document.getElementById('form-evento').reset();
  document.getElementById('ev-fecha').value = hoyISO();
  renderAll();
}

function eliminarEvento(id) {
  if (!confirm('¿Eliminar esta anotación?')) return;
  state.eventos = state.eventos.filter(e => e.id !== id);
  guardar();
  renderAll();
}

/* ---------- Backup Excel ---------- */

function generarBackup() {
  const wb = XLSX.utils.book_new();

  const mascotasSheet = state.mascotas.map(m => ({
    id: m.id, nombre: m.nombre, especie: m.especie, raza: m.raza, sexo: m.sexo,
    nacimiento: m.nacimiento, nacimiento_estimado: m.nacimientoEstimado ? 'sí' : 'no',
    llegada: m.llegada, esterilizado: m.esterilizado ? 'sí' : 'no', microchip: m.microchip,
    activo: m.activo ? 'sí' : 'no', fecha_archivado: m.fechaArchivado || '',
    peso_actual_kg: pesoActual(m) || '', descripcion: m.descripcion
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mascotasSheet), 'Mascotas');

  const pesosSheet = [];
  state.mascotas.forEach(m => (m.pesos || []).forEach(p => pesosSheet.push({ mascota: m.nombre, fecha: p.fecha, peso_kg: p.peso })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pesosSheet), 'Historial Peso');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.comprasComida.map(c => ({
    fecha: c.fecha, marca: c.marca, kg: c.kg, costo_gs: c.costo
  }))), 'Compras Comida');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.vacunas.map(v => ({
    mascota: nombreMascota(v.mascotaId), nombre: v.nombre, fecha: v.fecha, proxima_fecha: v.proximaFecha || ''
  }))), 'Vacunas');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.tratamientos.map(t => ({
    mascota: nombreMascota(t.mascotaId), tipo: t.tipo, producto: t.producto, fecha: t.fecha, proxima_fecha: t.proximaFecha || ''
  }))), 'Tratamientos');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.medicamentos.map(m => ({
    mascota: nombreMascota(m.mascotaId), nombre: m.nombre, dosis: m.dosis, fecha_inicio: m.fechaInicio, fecha_fin: m.fechaFin || '', notas: m.notas
  }))), 'Medicamentos');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.visitasVet.map(v => ({
    mascota: nombreMascota(v.mascotaId), fecha: v.fecha, motivo: v.motivo, diagnostico: v.diagnostico, veterinario: v.veterinario, costo_gs: v.costo
  }))), 'Visitas Veterinario');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.gastosExtra.map(g => ({
    fecha: g.fecha, categoria: g.categoria, descripcion: g.descripcion, monto_gs: g.monto, mascota: g.mascotaId ? nombreMascota(g.mascotaId) : 'Compartido'
  }))), 'Gastos Extra');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.eventos.map(ev => ({
    fecha: ev.fecha, mascota: ev.mascotaId ? nombreMascota(ev.mascotaId) : 'General', nota: ev.nota
  }))), 'Bitacora');

  return wb;
}

function descargarBackup(manual = false) {
  const wb = generarBackup();
  const nombreArchivo = `guarida_backup_${hoyISO()}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
  if (!manual) {
    localStorage.setItem(BACKUP_FLAG_KEY, hoyISO());
  }
}

function verificarBackupDiario() {
  const ultimo = localStorage.getItem(BACKUP_FLAG_KEY);
  if (ultimo !== hoyISO()) {
    // Pequeño retraso para no competir con el render inicial
    setTimeout(() => descargarBackup(false), 800);
  }
}

/* ---------- Importar backup ---------- */

function abrirImportar() {
  document.getElementById('input-importar').click();
}

function onImportarArchivo(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      importarDesdeWorkbook(wb);
      alert('Datos importados correctamente.');
      renderAll();
    } catch (err) {
      alert('No se pudo leer el archivo. Verificá que sea un backup válido de Guarida.');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function importarDesdeWorkbook(wb) {
  if (!confirm('Esto reemplazará todos los datos actuales por los del backup. ¿Continuar?')) return;

  const hoja = (nombre) => wb.Sheets[nombre] ? XLSX.utils.sheet_to_json(wb.Sheets[nombre]) : [];

  const mascotasRaw = hoja('Mascotas');
  const pesosRaw = hoja('Historial Peso');

  const nuevasMascotas = mascotasRaw.map(m => ({
    id: Number(m.id),
    nombre: m.nombre,
    especie: m.especie,
    raza: m.raza || '',
    sexo: m.sexo || '',
    nacimiento: m.nacimiento || null,
    nacimientoEstimado: m.nacimiento_estimado === 'sí',
    llegada: m.llegada || null,
    esterilizado: m.esterilizado === 'sí',
    microchip: m.microchip || '',
    activo: m.activo === 'sí',
    fechaArchivado: m.fecha_archivado || null,
    descripcion: m.descripcion || '',
    foto: null,
    pesos: []
  }));

  pesosRaw.forEach(p => {
    const m = nuevasMascotas.find(x => x.nombre === p.mascota);
    if (m) m.pesos.push({ fecha: p.fecha, peso: p.peso_kg });
  });

  const buscarIdPorNombre = (nombre) => {
    const m = nuevasMascotas.find(x => x.nombre === nombre);
    return m ? m.id : null;
  };

  state.mascotas = nuevasMascotas;
  state.comprasComida = hoja('Compras Comida').map(c => ({ id: nuevoId(), fecha: c.fecha, marca: c.marca, kg: c.kg, costo: c.costo_gs }));
  state.vacunas = hoja('Vacunas').map(v => ({ id: nuevoId(), mascotaId: buscarIdPorNombre(v.mascota), nombre: v.nombre, fecha: v.fecha, proximaFecha: v.proxima_fecha || null }));
  state.tratamientos = hoja('Tratamientos').map(t => ({ id: nuevoId(), mascotaId: buscarIdPorNombre(t.mascota), tipo: t.tipo, producto: t.producto, fecha: t.fecha, proximaFecha: t.proxima_fecha || null }));
  state.medicamentos = hoja('Medicamentos').map(m => ({ id: nuevoId(), mascotaId: buscarIdPorNombre(m.mascota), nombre: m.nombre, dosis: m.dosis, fechaInicio: m.fecha_inicio, fechaFin: m.fecha_fin || null, notas: m.notas }));
  state.visitasVet = hoja('Visitas Veterinario').map(v => ({ id: nuevoId(), mascotaId: buscarIdPorNombre(v.mascota), fecha: v.fecha, motivo: v.motivo, diagnostico: v.diagnostico, veterinario: v.veterinario, costo: v.costo_gs }));
  state.gastosExtra = hoja('Gastos Extra').map(g => ({ id: nuevoId(), fecha: g.fecha, categoria: g.categoria, descripcion: g.descripcion, monto: g.monto_gs, mascotaId: g.mascota !== 'Compartido' ? buscarIdPorNombre(g.mascota) : null }));
  state.eventos = hoja('Bitacora').map(ev => ({ id: nuevoId(), fecha: ev.fecha, mascotaId: ev.mascota !== 'General' ? buscarIdPorNombre(ev.mascota) : null, nota: ev.nota }));

  guardar();
}

/* ---------- Render general ---------- */

function renderAll() {
  renderDashboard();
  renderMascotas();
  renderComida();
  renderSalud();
  renderGastos();
  renderBitacora();
}

/* ---------- Inicialización ---------- */

function initFechas() {
  document.querySelectorAll('input[type="date"].hoy-default').forEach(input => {
    if (!input.value) input.value = hoyISO();
  });
}

function initModales() {
  document.querySelectorAll('.modal-fondo').forEach(fondo => {
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo) fondo.classList.remove('abierto');
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  cargar();
  initTabs();
  initModales();
  initFechas();
  renderAll();
  verificarBackupDiario();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW error:', err));
  }
});
