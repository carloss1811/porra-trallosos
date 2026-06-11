/**
 * 🏆 PORRA TRALLOSA — Mundial 2026
 *
 * Este script crea automáticamente el formulario de la porra y su hoja de
 * respuestas en tu Google Drive.
 *
 * CÓMO USARLO (2 minutos):
 *   1. Entra en https://script.google.com con tu cuenta de Google.
 *   2. "Nuevo proyecto" → borra el contenido del editor y pega este archivo entero.
 *   3. Arriba, selecciona la función "crearPorraTrallosa" y pulsa ▶ Ejecutar.
 *   4. Autoriza los permisos cuando te lo pida (es tu propia cuenta).
 *   5. Abre "Registro de ejecución": ahí salen las 3 URLs
 *      (formulario para compartir, formulario para editar y hoja de respuestas).
 *   6. Comparte la URL del formulario con los trallosos. ¡Listo!
 */

// ============================== DATOS ==============================

const GRUPOS = {
  'A': ['México', 'Sudáfrica', 'Corea del Sur', 'Chequia'],
  'B': ['Canadá', 'Bosnia y Herzegovina', 'Catar', 'Suiza'],
  'C': ['Brasil', 'Marruecos', 'Haití', 'Escocia'],
  'D': ['Estados Unidos', 'Paraguay', 'Australia', 'Turquía'],
  'E': ['Alemania', 'Curazao', 'Costa de Marfil', 'Ecuador'],
  'F': ['Países Bajos', 'Japón', 'Suecia', 'Túnez'],
  'G': ['Bélgica', 'Egipto', 'Irán', 'Nueva Zelanda'],
  'H': ['España', 'Cabo Verde', 'Arabia Saudí', 'Uruguay'],
  'I': ['Francia', 'Senegal', 'Irak', 'Noruega'],
  'J': ['Argentina', 'Argelia', 'Austria', 'Jordania'],
  'K': ['Portugal', 'RD Congo', 'Uzbekistán', 'Colombia'],
  'L': ['Inglaterra', 'Croacia', 'Ghana', 'Panamá'],
};

const FAVORITAS = [
  'Francia', 'España', 'Argentina', 'Inglaterra', 'Portugal',
  'Brasil', 'Países Bajos', 'Marruecos', 'Bélgica', 'Alemania',
];

function todasLasSelecciones() {
  return Object.values(GRUPOS).flat().sort();
}

function noFavoritas() {
  return todasLasSelecciones().filter(function (e) { return FAVORITAS.indexOf(e) === -1; });
}

// ============================== SCRIPT ==============================

function crearPorraTrallosa() {
  const form = FormApp.create('🏆 PORRA TRALLOSA — Mundial 2026');
  const equipos = todasLasSelecciones();

  form.setDescription(
    'La porra del Mundial 2026 de los trallosos.\n\n' +
    '⏰ FECHA LÍMITE: hay que enviar las respuestas ANTES del partido inaugural ' +
    '(México – Sudáfrica, hoy 11 de junio a las 21:00, hora española). ' +
    'Después no se puede cambiar NADA.\n\n' +
    '💰 INSCRIPCIÓN Y PREMIOS: cada uno pone su parte del bote. ' +
    'Reparto: 1º → 60% · 2º → 25% · 3º → 10% · Premio especial → 5% ' +
    '(quien más se acerque al minuto del primer gol de la final).\n\n' +
    '📜 NORMAS BÁSICAS:\n' +
    '· Respuestas concretas; si tu jugador se lesiona o no va convocado, no se cambia.\n' +
    '· En eliminatorias cuenta hasta dónde llega cada selección (da igual perder en 90\', prórroga o penaltis).\n' +
    '· El resultado exacto de la final incluye la prórroga pero NO la tanda de penaltis. ' +
    'Si hay penaltis, el ganador es quien gane la tanda.\n' +
    '· Equipo revelación: elige una NO favorita; gana la no favorita que más lejos llegue.\n' +
    '· Equipo decepción: elige una favorita; "gana" la favorita que antes caiga.\n' +
    '· Favoritas (solo estas 10): ' + FAVORITAS.join(', ') + '.\n\n' +
    'La clasificación se podrá seguir en directo en la web de la Porra Trallosa. ¡Suerte! 🍀'
  );

  form.addTextItem()
    .setTitle('NOMBRE')
    .setHelpText('Tu nombre de tralloso. Será el que aparezca en el ranking de la web.')
    .setRequired(true);

  // ---------- El Mundial ----------
  form.addPageBreakItem()
    .setTitle('🌍 El Mundial')
    .setHelpText('Las predicciones gordas del torneo.');

  form.addListItem()
    .setTitle('1. CAMPEÓN DEL MUNDIAL (25 puntos)')
    .setChoiceValues(equipos)
    .setRequired(true);

  form.addListItem()
    .setTitle('2. SUBCAMPEÓN DEL MUNDIAL (18 puntos)')
    .setChoiceValues(equipos)
    .setRequired(true);

  const semis = form.addCheckboxItem()
    .setTitle('3. SEMIFINALISTAS (6 puntos por acierto)')
    .setHelpText('Elige exactamente 4 selecciones.')
    .setChoiceValues(equipos)
    .setRequired(true);
  semis.setValidation(
    FormApp.createCheckboxValidation()
      .setHelpText('Tienes que elegir exactamente 4 selecciones.')
      .requireSelectExactly(4)
      .build()
  );

  const cuartos = form.addCheckboxItem()
    .setTitle('4. CUARTOFINALISTAS (3 puntos por acierto)')
    .setHelpText('Elige exactamente 8 selecciones (puedes repetir las de semifinales, claro).')
    .setChoiceValues(equipos)
    .setRequired(true);
  cuartos.setValidation(
    FormApp.createCheckboxValidation()
      .setHelpText('Tienes que elegir exactamente 8 selecciones.')
      .requireSelectExactly(8)
      .build()
  );

  form.addTextItem()
    .setTitle('5. MÁXIMO GOLEADOR DEL MUNDIAL (10 puntos)')
    .setHelpText('Nombre y apellido del jugador. Ejemplo: Kylian Mbappé.')
    .setRequired(true);

  form.addListItem()
    .setTitle('6. EQUIPO REVELACIÓN (8 puntos)')
    .setHelpText('Solo selecciones NO favoritas. Gana la no favorita que más lejos llegue.')
    .setChoiceValues(noFavoritas())
    .setRequired(true);

  form.addListItem()
    .setTitle('7. EQUIPO DECEPCIÓN (8 puntos)')
    .setHelpText('Solo las 10 favoritas. "Gana" la favorita que antes caiga eliminada.')
    .setChoiceValues(FAVORITAS)
    .setRequired(true);

  // ---------- España ----------
  form.addPageBreakItem()
    .setTitle('🇪🇸 España')
    .setHelpText('Grupo H: España, Cabo Verde, Arabia Saudí y Uruguay. Debut el 21 de junio contra Arabia Saudí.');

  form.addMultipleChoiceItem()
    .setTitle('8. ¿HASTA DÓNDE LLEGA ESPAÑA? (12 puntos)')
    .setChoiceValues(['Fase de grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinales', 'Final', 'Campeón'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('9. ¿ESPAÑA GANA SU GRUPO? (5 puntos)')
    .setChoiceValues(['Sí', 'No'])
    .setRequired(true);

  form.addTextItem()
    .setTitle('10. MÁXIMO GOLEADOR DE ESPAÑA (8 puntos)')
    .setHelpText('Nombre y apellido del jugador.')
    .setRequired(true);

  const golesEspana = form.addTextItem()
    .setTitle('11. GOLES TOTALES DE ESPAÑA EN EL MUNDIAL (10 puntos exacto / 5 si fallas por 1)')
    .setHelpText('Un número. Goles a favor en todo el torneo (sin contar tandas de penaltis).')
    .setRequired(true);
  golesEspana.setValidation(
    FormApp.createTextValidation()
      .setHelpText('Pon un número entero entre 0 y 50.')
      .requireNumberBetween(0, 50)
      .build()
  );

  form.addTextItem()
    .setTitle('12. PRIMER GOLEADOR DE ESPAÑA (8 puntos)')
    .setHelpText('Nombre y apellido del jugador que marcará el primer gol de España en el Mundial.')
    .setRequired(true);

  // ---------- Fase de grupos ----------
  form.addPageBreakItem()
    .setTitle('📊 Fase de grupos')
    .setHelpText(
      'Elige el 1º y el 2º de cada grupo (¡que no sean el mismo equipo!).\n' +
      'Puntuación por grupo: 1º exacto → 4 puntos · 2º exacto → 3 puntos · ' +
      'acertar que pasa pero en otra posición → 2 puntos.'
    );

  Object.keys(GRUPOS).forEach(function (letra) {
    const equiposGrupo = GRUPOS[letra];
    form.addListItem()
      .setTitle('Grupo ' + letra + ' — 1º clasificado')
      .setHelpText(equiposGrupo.join(' · '))
      .setChoiceValues(equiposGrupo)
      .setRequired(true);
    form.addListItem()
      .setTitle('Grupo ' + letra + ' — 2º clasificado')
      .setHelpText('Distinto del 1º.')
      .setChoiceValues(equiposGrupo)
      .setRequired(true);
  });

  // ---------- La final ----------
  form.addPageBreakItem()
    .setTitle('🏁 La final')
    .setHelpText('19 de julio de 2026, MetLife Stadium (Nueva York / Nueva Jersey).');

  form.addTextItem()
    .setTitle('13. RESULTADO EXACTO DE LA FINAL (12 puntos)')
    .setHelpText(
      'Formato: Equipo1 2-1 Equipo2. Ejemplo: España 2-1 Francia.\n' +
      'Cuenta el marcador tras la prórroga si la hay, SIN la tanda de penaltis.'
    )
    .setRequired(true);

  form.addListItem()
    .setTitle('14. GANADOR DE LA FINAL (5 puntos si aciertas el ganador pero no el resultado exacto)')
    .setChoiceValues(equipos)
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('15. ¿HABRÁ TANDA DE PENALTIS EN LA FINAL? (5 puntos)')
    .setChoiceValues(['Sí', 'No'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('16. ¿HABRÁ TARJETA ROJA EN LA FINAL? (5 puntos)')
    .setChoiceValues(['Sí', 'No'])
    .setRequired(true);

  form.addTextItem()
    .setTitle('17. MINUTO DEL PRIMER GOL DE LA FINAL (10 puntos exacto / 5 si fallas por 5 o menos)')
    .setHelpText(
      'Un número (por ejemplo: 23). Si crees que la final acaba 0-0, escribe: No hay gol.\n' +
      'Esta pregunta decide además el PREMIO ESPECIAL (5% del bote): se lo lleva quien más se acerque.'
    )
    .setRequired(true);

  // ---------- Hoja de respuestas ----------
  const ss = SpreadsheetApp.create('Porra Trallosa — Respuestas');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('==========================================================');
  Logger.log('✅ ¡Porra Trallosa creada!');
  Logger.log('📤 Formulario para COMPARTIR: ' + form.shortenFormUrl(form.getPublishedUrl()));
  Logger.log('✏️  Formulario para EDITAR:   ' + form.getEditUrl());
  Logger.log('📊 Hoja de respuestas:       ' + ss.getUrl());
  Logger.log('==========================================================');
  Logger.log('Pásale a Claude la URL de la hoja de respuestas para conectar la web.');
}
