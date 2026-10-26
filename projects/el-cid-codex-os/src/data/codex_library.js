/**
 * Project EL CID (El Códice de Inmersión Dinámica) — Biblioteca Multi-Capítulo y Cargador de Libros
 * 100% Adaptado al Español: Sintetiza Kindle Word Wise + X-Ray con CEFR de Busuu y Escenarios Reales en Español.
 */

const EL_CID_DEFAULT_LIBRARY = [
  {
    id: "book_quijote_codex",
    title: "El Ingenioso Hidalgo Don Quijote de la Mancha (Edición Códice)",
    author: "Miguel de Cervantes Saavedra",
    cefrBand: "B2 – C2",
    genre: "Clásico Castellano y Filosofía",
    coverBadge: "⚔️ Clásico Recomendado",
    estimatedWpmTarget: 165,
    description: "Capítulos fundacionales con análisis morfológico de raíces latinas, glosario dinámico y desafíos de prosodia castellana.",
    xrayEntities: [
      { name: "Alonso Quijano (Don Quijote)", role: "Hidalgo manchego apasionado por los libros de caballerías que decide buscar aventuras.", rootLink: "fam_viv" },
      { name: "Rocinante", role: "Caballo flaco pero renombrado por su señor como el primero de todos los rocines del mundo.", rootLink: "fam_ten" },
      { name: "Dulcinea del Toboso", role: "Dama idealizada a quien consagra sus hazañas, pensamientos y victorias.", rootLink: "fam_pon" },
      { name: "La Mancha", role: "Región histórica castellana donde da comienzo la travesía literaria.", rootLink: "fam_duc" }
    ],
    chapters: [
      {
        chapterNumber: 1,
        title: "Capítulo I: Que trata de la condición y ejercicio del famoso hidalgo",
        cefrFocus: "B2 / C1",
        grammarFocus: "Pretérito Imperfecto Descriptivo frente a Pretérito Indefinido Narrativo",
        paragraphs: [
          {
            id: "quijote_c1_p1",
            es: "En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor. Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda.",
            en: "Paráfrasis Castellana Contemporánea: En un pueblo de la Mancha cuyo nombre prefiero no recordar, vivía hace poco tiempo un caballero hidalgo con lanza guardada, escudo antiguo, caballo delgado y perro veloz. Sus comidas diarias consumían tres cuartas partes de su patrimonio. (Contexto Inglés: In a village of La Mancha... there lived a gentleman whose daily provisions consumed three-quarters of his estate.)",
            targetRoots: ["viv-", "ten-", "consum-"],
            pimsleurPrompt: {
              cueEn: "Pregunta en voz alta si usted vivía en este lugar hace poco tiempo:",
              targetEs: "¿Vivía usted en este lugar no hace mucho tiempo?",
              ipa: "/bi.ˈβi.a us.ˈteð en ˈes.te lu.ˈɣaɾ no ˈa.θe ˈmu.tʃo ˈtjem.po/"
            }
          },
          {
            id: "quijote_c1_p2",
            es: "Es, pues, de saber que este sobredicho hidalgo, los ratos que estaba ocioso, que eran los más del año, se daba a leer libros de caballerías con tanta afición y gusto, que olvidó casi de todo punto el ejercicio de la caza, y aun la administración de su hacienda; y llegó a tanto su curiosidad y desatino en esto, que vendió muchas hanegas de tierra de sembradura para comprar libros de caballerías en que leer.",
            en: "Paráfrasis Castellana Contemporánea: Conviene saber que este caballero dedicaba sus momentos libres a leer libros de caballerías con tanta pasión que abandonó la caza y la gestión de sus bienes, llegando incluso a vender tierras de cultivo para adquirir nuevas obras. (Contexto Inglés: Whenever at leisure, he gave himself up to reading books of chivalry, neglecting the management of his estate and selling land to buy books.)",
            targetRoots: ["sab-", "admin-", "vend-", "compr-"],
            pimsleurPrompt: {
              cueEn: "Afirma en voz alta que es necesario administrar la hacienda con prudencia:",
              targetEs: "Es necesario administrar la hacienda con prudencia y rigor.",
              ipa: "/es ne.θe.ˈsa.ɾjo að.mi.nis.ˈtɾaɾ la a.ˈθjen.da kon pɾu.ˈðen.θja/"
            }
          },
          {
            id: "quijote_c1_p3",
            es: "En resolución, él se enfrascó tanto en su lectura, que se le pasaban las noches leyendo de claro en claro, y los días de turbio en turbio; y así, del poco dormir y del mucho leer, se le secó el celebro, de manera que vino a perder el juicio. Llenósele la fantasía de todo aquello que leía en los libros, así de encantamientos como de pendencias, batallas, desafíos, heridas, requiebros, amores, tormentas y disparates imposibles.",
            en: "Paráfrasis Castellana Contemporánea: En conclusión, se sumergió tanto en la lectura día y noche que, por falta de sueño y exceso de estudio, perdió la razón y colmó su imaginación de batallas, desafíos y hazañas extraordinarias. (Contexto Inglés: He became so absorbed in his reading day and night that his imagination grew full of battles, challenges, and impossible feats.)",
            targetRoots: ["lect-", "pas-", "perd-", "impos-"],
            pimsleurPrompt: {
              cueEn: "Expresa en voz alta que no podemos perder el juicio durante el desafío:",
              targetEs: "No podemos perder el juicio durante el desafío.",
              ipa: "/no po.ˈðe.mos peɾ.ˈðeɾ el ˈxwi.θjo du.ˈɾan.te el de.sa.ˈfi.o/"
            }
          }
        ],
        realWorldQuiz: [
          {
            id: "q_quijote_1",
            scenario: "Escenario Real Busuu (Dirección Financiera en Madrid): Estás analizando con un socio los costos operativos que absorben el 75 % del presupuesto anual.",
            question: "¿Qué expresión fundamentada en el Capítulo I expresa con mayor precisión ejecutiva que dichos gastos absorben tres cuartas partes del patrimonio?",
            options: [
              "Estos gastos ordinarios consumen las tres partes de nuestra hacienda y presupuesto.",
              "Estos gastos venden las hanegas de sembradura en el astillero antiguo.",
              "Estos gastos olvidan el ejercicio de la caza de turbio en turbio.",
              "Estos gastos contradicen el rocín flaco de los domingos."
            ],
            correctIndex: 0,
            explanation: "«Consumir las tres partes de la hacienda» conecta el giro clásico cervantino con la administración patrimonial moderna."
          },
          {
            id: "q_quijote_2",
            scenario: "Análisis Morfosintáctico Busuu: Observa cómo Cervantes contrasta acciones habituales («vivía», «estaba ocioso») con decisiones puntuales («olvidó», «vendió», «vino a perder»).",
            question: "¿Cuál de las siguientes oraciones emplea correctamente el pretérito indefinido seguido de «para + infinitivo» de propósito?",
            options: [
              "Vendió parte de sus tierras para introducir nuevos libros en su biblioteca.",
              "Vendía parte de sus tierras por introduciendo nuevos libros en su biblioteca.",
              "Venderá parte de sus tierras para introducido nuevos libros en su biblioteca.",
              "Vende parte de sus tierras sin introdujo nuevos libros en su biblioteca."
            ],
            correctIndex: 0,
            explanation: "El pretérito indefinido («vendió») marca la transacción concluida y «para introducir» expresa la finalidad."
          }
        ]
      },
      {
        chapterNumber: 2,
        title: "Capítulo II: De la primera salida que de su tierra hizo el ingenioso Don Quijote",
        cefrFocus: "B2 / C1",
        grammarFocus: "Cláusulas Absolutas de Participio y Subjuntivo de Finalidad",
        paragraphs: [
          {
            id: "quijote_c2_p1",
            es: "Hechas, pues, estas prevenciones, no quiso aguardar más tiempo a poner en efeto su pensamiento, apretándole a ello la falta que él pensaba que hacía en el mundo su tardanza, según eran los agravios que pensaba deshacer, tuertos que enderezar, sinrazones que enmendar, y abusos que mejorar y deudas que satisfacer.",
            en: "Paráfrasis Castellana Contemporánea: Una vez concluidos estos preparativos, decidió no esperar más para ejecutar su propósito, convencido de que el mundo necesitaba su intervención para corregir injusticias y saldar deudas. (Contexto Inglés: Once these preparations were made, he did not wish to wait any longer to put his plan into effect and discharge his duties.)",
            targetRoots: ["prev-", "pon-", "hac-", "satisfac-"],
            pimsleurPrompt: {
              cueEn: "Di en voz alta que no queremos aguardar más tiempo para poner en efecto nuestro plan:",
              targetEs: "No queremos aguardar más tiempo para poner en efecto nuestro plan.",
              ipa: "/no ke.ˈɾe.mos a.ɣwaɾ.ˈðaɾ mas ˈtjem.po ˈpa.ɾa po.ˈneɾ en e.ˈfek.to ˈnwes.tɾo plan/"
            }
          },
          {
            id: "quijote_c2_p2",
            es: "Y así, sin dar parte a persona alguna de su intención y sin que nadie le viese, una mañana, antes del día, que era uno de los calurosos del mes de julio, se armó de todas sus armas, subió sobre Rocinante, puesta su mal compuesta celada, embrazó su adarga, tomó su lanza y por la puerta falsa de un corral salió al campo con grandísimo contento y alborozo de ver con cuánta facilidad había dado principio a su buen deseo.",
            en: "Paráfrasis Castellana Contemporánea: Sin comunicar a nadie su propósito y sin ser visto, al amanecer de un día de julio vistió su armadura, montó a Rocinante y salió al campo con inmensa alegría al ver iniciado su gran proyecto. (Contexto Inglés: Without informing anyone of his intention and without anyone seeing him, before dawn he donned his armor and rode out with great joy.)",
            targetRoots: ["intenc-", "ver-", "comp-", "fac-"],
            pimsleurPrompt: {
              cueEn: "Expresa en voz alta «sin que nadie lo viese ni conociese su intención»:",
              targetEs: "Sin que nadie lo viese ni conociese su intención.",
              ipa: "/sin ke ˈna.ðje lo ˈbje.se ni ko.no.ˈθje.se su in.ten.ˈθjon/"
            }
          }
        ],
        realWorldQuiz: [
          {
            id: "q_quijote_c2_1",
            scenario: "Escenario Ejecutivo Busuu: Tu equipo ha completado todas las medidas preventivas y debe ejecutar el despliegue de inmediato.",
            question: "¿Cómo expresas con registro C1 «Una vez hechas estas prevenciones, decidimos poner en efecto el proyecto y satisfacer las obligaciones»?",
            options: [
              "Hechas estas prevenciones, decidimos poner en efecto el proyecto y satisfacer las obligaciones.",
              "Haciendo estas prevenciones, quisiéramos aguardar la tardanza sin satisfacer.",
              "Hechos estos agravios, salimos por la puerta falsa para deshacer el contrato.",
              "Puestas las armas, nadie nos vio contradecir las deudas."
            ],
            correctIndex: 0,
            explanation: "El participio absoluto («Hechas estas prevenciones») junto con «poner en efecto» y «satisfacer» constituye español ejecutivo de alto nivel."
          }
        ]
      }
    ]
  },
  {
    id: "book_estrategia_ciber",
    title: "Arquitectura de Soberanía Digital, IA Agéntica y Finanzas Cuantitativas",
    author: "Códice Estratégico MGC",
    cefrBand: "B1 – C1",
    genre: "Ciberseguridad, IA y Geopolítica",
    coverBadge: "🛡️ Recomendado Ejecutivo",
    estimatedWpmTarget: 175,
    description: "Manual contemporáneo de lectura continua sobre infraestructura crítica, criptografía, modelos operativos y negociación internacional.",
    xrayEntities: [
      { name: "Protocolo de Confianza Cero (Zero-Trust)", role: "Arquitectura defensiva que exige verificación criptográfica continua en cada nodo.", rootLink: "fam_ten" },
      { name: "Orquestador Agéntico", role: "Sistema autónomo que coordina subagentes especializados en paralelo.", rootLink: "fam_duc" },
      { name: "Liquidez Algorítmica", role: "Flujo de capital ejecutado con baja latencia y estricto control de riesgo.", rootLink: "fam_pon" }
    ],
    chapters: [
      {
        chapterNumber: 1,
        title: "Capítulo I: Defensa de Infraestructuras Críticas y Confianza Cero",
        cefrFocus: "B2 / C1",
        grammarFocus: "Cláusulas Relativas Restrictivas y Verbos de Control Operativo",
        paragraphs: [
          {
            id: "ciber_c1_p1",
            es: "Los arquitectos de seguridad buscan prevenir intrusiones mediante protocolos de confianza cero que impiden exponer credenciales sensibles en la red pública. Ningún nodo externo puede intervenir en el núcleo operativo sin superar antes una rigurosa verificación criptográfica.",
            en: "Paráfrasis Técnica: La arquitectura de confianza cero previene intrusiones al prohibir la exposición de credenciales y exigir validación criptográfica antes de cualquier intervención externa. (Contexto Inglés: Security architects seek to prevent intrusions through zero-trust protocols that prevent exposing sensitive credentials.)",
            targetRoots: ["ven-", "pon-", "ver-"],
            pimsleurPrompt: {
              cueEn: "Declara en voz alta que ningún nodo externo puede intervenir sin verificación:",
              targetEs: "Ningún nodo externo puede intervenir sin verificación criptográfica.",
              ipa: "/nin.ˈɡun ˈno.ðo eks.ˈteɾ.no ˈpwe.ðe in.teɾ.βe.ˈniɾ sin be.ɾi.fi.ka.ˈθjon kɾip.to.ˈɣɾa.fi.ka/"
            }
          },
          {
            id: "ciber_c1_p2",
            es: "Cuando los sensores telemétricos logran prever un vector de ataque anómalo, el sistema autónomo procede a contener el tráfico sospechoso, aislar los contenedores afectados y emitir alertas inmediatas al centro de mando estratégico.",
            en: "Paráfrasis Técnica: Ante la detección temprana de una anomalía, la red contiene automáticamente el tráfico hostil, aísla los segmentos comprometidos y notifica al centro de mando. (Contexto Inglés: When telemetric sensors foresee an anomalous attack vector, the autonomous system proceeds to contain suspicious traffic and issue immediate alerts.)",
            targetRoots: ["ver-", "ten-", "mit-"],
            pimsleurPrompt: {
              cueEn: "Expresa en voz alta que el sistema procede a contener el tráfico y emitir alertas:",
              targetEs: "El sistema procede a contener el tráfico y emitir alertas inmediatas.",
              ipa: "/el sis.ˈte.ma pɾo.ˈθe.ðe a kon.te.ˈneɾ el ˈtɾa.fi.ko i e.mi.ˈtiɾ a.ˈleɾ.tas in.me.ˈðja.tas/"
            }
          },
          {
            id: "ciber_c1_p3",
            es: "Para mantener la resiliencia operativa a largo plazo, resulta imprescindible revisar continuamente los modelos predictivos, corregir cualquier deriva estadística y disponer de respaldos inmutables que permitan restablecer el servicio en cuestión de segundos.",
            en: "Paráfrasis Técnica: La continuidad operativa requiere auditar los modelos predictivos contra la deriva estadística y mantener copias de seguridad inmutables de recuperación instantánea. (Contexto Inglés: To maintain long-term operational resilience, it is essential to continuously review predictive models and keep immutable backups available.)",
            targetRoots: ["ten-", "vis-", "pon-"],
            pimsleurPrompt: {
              cueEn: "Afirma en voz alta que resulta imprescindible revisar continuamente los modelos predictivos:",
              targetEs: "Resulta imprescindible revisar continuamente los modelos predictivos.",
              ipa: "/re.ˈsul.ta im.pɾes.θin.ˈdi.βle re.βi.ˈsaɾ kon.ti.nwa.ˈmen.te los mo.ˈðe.los pɾe.ðik.ˈti.βos/"
            }
          }
        ],
        realWorldQuiz: [
          {
            id: "q_ciber_1",
            scenario: "Escenario Centro de Operaciones de Seguridad (SOC): Estás presentando un informe ejecutivo ante el director de seguridad tras contener un incidente.",
            question: "¿Qué enunciado comunica con precisión que los sensores previeron el vector, contuvieron el tráfico y emitieron alertas?",
            options: [
              "Los sensores lograron prever el vector, contener el tráfico y emitir alertas al centro de mando.",
              "Los sensores lograron suponer la credencial, exponer el nodo y someter el respaldo.",
              "Los sensores decidieron contradecir el tráfico y convivir con la intrusión.",
              "Los sensores pudieron reducir la verificación para admitir el vector anómalo."
            ],
            correctIndex: 0,
            explanation: "«Prever», «contener» y «emitir alertas» conforman la tríada léxica exacta de respuesta ante incidentes en español técnico."
          }
        ]
      }
    ]
  },
  {
    id: "book_al_andalus_crónica",
    title: "Crónicas de Córdoba y Toledo: La Escuela de Traductores",
    author: "Archivo Filológico Hispánico",
    cefrBand: "A2 – B2",
    genre: "Historia, Ciencia y Diplomacia",
    coverBadge: "📜 Lectura Graduada (A2→B2)",
    estimatedWpmTarget: 150,
    description: "Relato graduado ideal para ganar fluidez rítmica en voz alta, conectando las grandes raíces latinas con la historia científica de España.",
    xrayEntities: [
      { name: "Escuela de Traductores de Toledo", role: "Centro intelectual donde sabios cristianos, árabes y judíos tradujeron la ciencia antigua al castellano.", rootLink: "fam_duc" },
      { name: "Bibliotecas de Córdoba", role: "Repositorio de cientos de miles de manuscritos astronómicos, médicos y filosóficos.", rootLink: "fam_mit" },
      { name: "Glosarios Bilingües", role: "Tablas léxicas creadas por los copistas para fijar el vocabulario científico en español.", rootLink: "fam_pon" }
    ],
    chapters: [
      {
        chapterNumber: 1,
        title: "Capítulo I: Los Manuscritos que Sobrevivieron al Tiempo",
        cefrFocus: "A2 / B1",
        grammarFocus: "Perífrasis Verbales de Logro («lograr + infinitivo», «permitir + infinitivo»)",
        paragraphs: [
          {
            id: "andalus_c1_p1",
            es: "En las antiguas bibliotecas de Córdoba y Toledo, los sabios y traductores lograron transmitir tratados científicos que habían conseguido sobrevivir a la caída de los imperios antiguos. Su trabajo constante permitió introducir conceptos matemáticos, astronómicos y médicos fundamentales en toda Europa.",
            en: "Síntesis Contextual: Los sabios de Córdoba y Toledo conservaron y tradujeron obras científicas antiguas, introduciendo en Europa las bases de la matemática y la medicina moderna. (Contexto Inglés: Scholars and translators in Cordoba and Toledo managed to transmit scientific treatises and introduce fundamental mathematical concepts across Europe.)",
            targetRoots: ["mit-", "viv-", "duc-"],
            pimsleurPrompt: {
              cueEn: "Expresa en voz alta que los traductores lograron transmitir tratados científicos:",
              targetEs: "Los traductores lograron transmitir tratados científicos.",
              ipa: "/los tɾa.ðuk.ˈto.ɾes lo.ˈɣɾa.ɾon tɾans.mi.ˈtiɾ tɾa.ˈta.ðos θjen.ˈti.fi.kos/"
            }
          },
          {
            id: "andalus_c1_p2",
            es: "Cada escuela de copistas buscaba componer glosarios bilingües y revisar minuciosamente las fuentes griegas, latinas y árabes. Esta extraordinaria convivencia intelectual demostró ser sumamente productiva para el nacimiento de las universidades modernas.",
            en: "Síntesis Contextual: La elaboración de glosarios y la revisión rigurosa de fuentes clásicas hicieron posible una convivencia intelectual que dio origen a las universidades. (Contexto Inglés: Each school of copyists sought to compose bilingual glossaries and meticulously review classical sources, proving highly productive for modern universities.)",
            targetRoots: ["pon-", "vis-", "viv-", "duc-"],
            pimsleurPrompt: {
              cueEn: "Di en voz alta que esta convivencia demostró ser sumamente productiva:",
              targetEs: "Esta convivencia demostró ser sumamente productiva.",
              ipa: "/ˈes.ta kom.bi.ˈβen.θja de.mos.ˈtɾo seɾ su.ma.ˈmen.te pɾo.ðuk.ˈti.βa/"
            }
          }
        ],
        realWorldQuiz: [
          {
            id: "q_andalus_1",
            scenario: "Escenario Académico Busuu: Estás explicando cómo colaboran distintos equipos de investigación para documentar terminología técnica.",
            question: "¿Qué oración adapta el vocabulario del Capítulo I para describir la creación de glosarios y la revisión de fuentes?",
            options: [
              "Nuestro equipo busca componer glosarios claros y revisar minuciosamente las fuentes técnicas.",
              "Nuestro equipo busca contradecir las bibliotecas y destruir los tratados antiguos.",
              "Nuestro equipo prefiere ocultar los conceptos matemáticos sin convivir.",
              "Nuestro equipo decidió perder los manuscritos antes de sobrevivir."
            ],
            correctIndex: 0,
            explanation: "«Componer glosarios» y «revisar minuciosamente las fuentes» son colocaciones académicas y profesionales de alta frecuencia en español."
          }
        ]
      }
    ]
  }
];

if (typeof window !== 'undefined') {
  window.EL_CID_DEFAULT_LIBRARY = EL_CID_DEFAULT_LIBRARY;
}
if (typeof module !== 'undefined') {
  module.exports = { EL_CID_DEFAULT_LIBRARY };
}
