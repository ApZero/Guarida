// data.js — Base de conocimiento para recomendaciones de cuidado.
// Contenido general orientativo, no reemplaza la consulta veterinaria.

const RECOMENDACIONES = {
  perro: {
    etiqueta: "Perro",
    tamanos: [
      { clave: "pequeño", maxKg: 10 },
      { clave: "mediano", maxKg: 25 },
      { clave: "grande", maxKg: 999 }
    ],
    vacunas: [
      { nombre: "Óctuple/Séxtuple (polivalente)", esquema: "3 dosis cada 3-4 semanas desde las 6-8 semanas de vida" },
      { nombre: "Refuerzo polivalente adulto", esquema: "Anual" },
      { nombre: "Antirrábica", esquema: "Primera dosis a los 3 meses; refuerzo anual" }
    ],
    desparasitacion: {
      cachorro: "Cada 2 semanas hasta los 3 meses, luego mensual hasta los 6 meses",
      adulto: "Interna cada 3 meses"
    },
    antipulgasGarrapatas: "Mensual, todo el año en climas cálidos como el Chaco",
    alimentacion: {
      cachorro: { pctPesoMin: 4, pctPesoMax: 6, nota: "Repartido en 3-4 comidas al día" },
      adulto: { pctPesoMin: 2, pctPesoMax: 3, nota: "Repartido en 1-2 comidas al día" },
      senior: { pctPesoMin: 1.5, pctPesoMax: 2.5, nota: "Ajustar según actividad; vigilar peso" }
    },
    tipsPorTamano: {
      "pequeño": [
        "Más propensos a problemas dentales: cepillado o snacks dentales regulares.",
        "Regulan peor el frío: abrigo en noches frías del invierno chaqueño.",
        "Porciones pequeñas pero más frecuentes ayudan a evitar hipoglucemia en cachorros."
      ],
      "mediano": [
        "Suelen ser el punto medio en necesidad de ejercicio: 30-60 min de actividad diaria.",
        "Vigilar sobrepeso, sobre todo en razas con tendencia a comer rápido."
      ],
      "grande": [
        "Mayor riesgo de displasia de cadera/codo: evitar saltos bruscos en cachorros.",
        "Crecimiento más lento (hasta 18-24 meses): alimento formulado para razas grandes si es posible.",
        "Más sensibles al calor extremo por su masa corporal: sombra y agua abundante en el Chaco."
      ]
    },
    razas: {
      "labrador retriever": { tamano: "grande", tips: ["Tendencia a la obesidad: controlar porciones estrictamente.", "Propensos a otitis: revisar oídos tras baños."] },
      "golden retriever": { tamano: "grande", tips: ["Pelaje denso: cepillado frecuente, más en muda estacional.", "Predisposición a problemas de cadera y cardíacos."] },
      "pastor alemán": { tamano: "grande", tips: ["Propensos a displasia de cadera: ejercicio moderado en el crecimiento.", "Necesitan estimulación mental además de física."] },
      "boxer": { tamano: "grande", tips: ["Sensibles al calor por ser braquicéfalos leves: evitar horas de sol fuerte.", "Chequeos cardíacos periódicos recomendados."] },
      "rottweiler": { tamano: "grande", tips: ["Crecimiento óseo lento: no forzar ejercicio de alto impacto de cachorro."] },
      "pitbull / terrier tipo pitbull": { tamano: "mediano", tips: ["Piel sensible: vigilar alergias y dermatitis.", "Alta energía: requieren ejercicio diario constante."] },
      "caniche / poodle": { tamano: "pequeño", tips: ["Pelaje requiere corte cada 4-6 semanas.", "Propensos a problemas dentales y lagrimeo ocular."] },
      "bulldog francés": { tamano: "pequeño", tips: ["Braquicéfalo: cuidado extremo con el calor y el esfuerzo físico.", "Pliegues faciales: limpieza regular para evitar irritación."] },
      "chihuahua": { tamano: "pequeño", tips: ["Muy sensibles al frío: abrigo en invierno.", "Dentición: riesgo alto de sarro, cepillado frecuente."] },
      "salchicha / dachshund": { tamano: "pequeño", tips: ["Columna larga: evitar saltos desde altura y subir/bajar escaleras en exceso.", "Vigilar peso para no sobrecargar la espalda."] },
      "border collie": { tamano: "mediano", tips: ["Necesita mucha estimulación mental, no solo física.", "Puede desarrollar comportamientos obsesivos sin suficiente actividad."] },
      "beagle": { tamano: "mediano", tips: ["Muy guiados por el olfato: propensos a comer lo que encuentren, vigilar.", "Tendencia a la obesidad."] },
      "criollo / sin raza definida": { tamano: null, tips: ["Suelen tener menos problemas genéticos hereditarios que las razas puras.", "Guiarse por el tamaño adulto estimado para dosificar alimento y cuidados."] }
    }
  },

  gato: {
    etiqueta: "Gato",
    tamanos: [
      { clave: "pequeño", maxKg: 3.5 },
      { clave: "mediano", maxKg: 5.5 },
      { clave: "grande", maxKg: 999 }
    ],
    vacunas: [
      { nombre: "Triple felina (panleucopenia, rinotraqueitis, calicivirus)", esquema: "3 dosis cada 3-4 semanas desde las 6-8 semanas de vida" },
      { nombre: "Refuerzo triple felina adulto", esquema: "Anual" },
      { nombre: "Antirrábica", esquema: "Primera dosis a los 3 meses; refuerzo anual" },
      { nombre: "Leucemia felina (FeLV)", esquema: "Recomendada si tiene acceso al exterior o contacto con otros gatos" }
    ],
    desparasitacion: {
      cachorro: "Cada 2 semanas hasta los 3 meses, luego mensual hasta los 6 meses",
      adulto: "Interna cada 3 meses"
    },
    antipulgasGarrapatas: "Mensual, especialmente si tiene acceso al exterior",
    alimentacion: {
      cachorro: { pctPesoMin: 5, pctPesoMax: 7, nota: "Repartido en 3-4 comidas al día" },
      adulto: { pctPesoMin: 2, pctPesoMax: 3, nota: "Repartido en 2 comidas al día" },
      senior: { pctPesoMin: 1.5, pctPesoMax: 2.5, nota: "Ajustar según actividad y masa muscular" }
    },
    tipsPorTamano: {
      "pequeño": [
        "Razas/individuos pequeños suelen ser más activos: juego diario recomendado.",
        "Vigilar hidratación; considerar fuentes de agua corriente."
      ],
      "mediano": [
        "Rango más común: controlar porciones para evitar sobrepeso en gatos de interior.",
        "Rascadores y estimulación ambiental reducen estrés y problemas urinarios."
      ],
      "grande": [
        "Articulaciones más exigidas: superficies blandas para saltar y descansar.",
        "Vigilar problemas renales/cardíacos con chequeos anuales desde adultez media."
      ]
    },
    razas: {
      "siamés": { tamano: "mediano", tips: ["Muy vocales y sociables: necesitan interacción frecuente.", "Propensos a problemas dentales y respiratorios leves."] },
      "persa": { tamano: "mediano", tips: ["Pelaje largo: cepillado diario para evitar nudos.", "Cara achatada: limpieza de ojos y vigilancia respiratoria."] },
      "maine coon": { tamano: "grande", tips: ["Predisposición a cardiomiopatía hipertrófica: chequeos cardíacos periódicos.", "Crecimiento hasta los 3-4 años."] },
      "bengalí": { tamano: "mediano", tips: ["Muy activos: requieren enriquecimiento ambiental y juego intenso."] },
      "criollo / sin raza definida": { tamano: null, tips: ["Generalmente robustos con pocas predisposiciones hereditarias.", "Guiarse por el tamaño adulto y nivel de actividad para ajustar porciones."] }
    }
  },

  otro: {
    etiqueta: "Otro",
    tamanos: [
      { clave: "pequeño", maxKg: 5 },
      { clave: "mediano", maxKg: 15 },
      { clave: "grande", maxKg: 999 }
    ],
    vacunas: [],
    desparasitacion: { cachorro: "Consultar con veterinario según especie", adulto: "Consultar con veterinario según especie" },
    antipulgasGarrapatas: "Consultar con veterinario según especie",
    alimentacion: {
      cachorro: { pctPesoMin: 3, pctPesoMax: 6, nota: "Varía mucho según especie" },
      adulto: { pctPesoMin: 2, pctPesoMax: 3, nota: "Varía mucho según especie" },
      senior: { pctPesoMin: 1.5, pctPesoMax: 2.5, nota: "Varía mucho según especie" }
    },
    tipsPorTamano: { "pequeño": [], "mediano": [], "grande": [] },
    razas: {}
  }
};

// Determina la categoría de tamaño según especie y peso actual (kg)
function calcularTamano(especie, pesoKg) {
  const base = RECOMENDACIONES[especie] || RECOMENDACIONES.otro;
  if (!pesoKg) return null;
  for (const t of base.tamanos) {
    if (pesoKg <= t.maxKg) return t.clave;
  }
  return base.tamanos[base.tamanos.length - 1].clave;
}

// Etapa de vida aproximada según edad en meses y especie
function calcularEtapa(especie, edadMeses) {
  if (edadMeses == null) return "adulto";
  if (edadMeses < 12) return "cachorro";
  if (edadMeses < 84) return "adulto"; // hasta 7 años
  return "senior";
}
