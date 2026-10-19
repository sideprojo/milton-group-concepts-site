/**
 * Core Learning Modes Engine for Spanish Acquisition OS
 * Encapsulates the 9 interactive modalities:
 * 1. Vocabulary
 * 2. Root Families
 * 3. Listening Acquisition
 * 4. Reading Immersion
 * 5. Pronunciation Lab
 * 6. Derivation Forge
 * 7. Translation Ladder
 * 8. Diagnostics
 * 9. Review Queue
 */

class LearningModesEngine {
  constructor(corpus, srsEngine) {
    this.corpus = corpus;
    this.srs = srsEngine;
    this.audioSynth = typeof window !== 'undefined' && 'speechSynthesis' in window 
      ? window.speechSynthesis 
      : null;
    this.activeAudio = null;
  }

  // Plays local synthesized neural MP3 first; falls back to offline WebSpeech if missing
  speak(text, rate = 1.0, audioRef = null) {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio = null;
    }
    if (this.audioSynth) {
      this.audioSynth.cancel();
    }

    // Attempt auto-lookup of local MP3 if audioRef wasn't explicitly passed
    let resolvedRef = audioRef;
    if (!resolvedRef && this.corpus && this.corpus.lexicon) {
      const isSlow = rate < 0.9;
      for (const item of this.corpus.lexicon) {
        if (item.word === text) {
          resolvedRef = isSlow ? item.slowAudioRef : item.audioRef;
          break;
        }
        const ex = item.examples.find(e => e.es === text);
        if (ex) {
          resolvedRef = isSlow ? ex.slowAudioRef : ex.audioRef;
          break;
        }
      }
    }

    if (resolvedRef && typeof Audio !== 'undefined') {
      const audio = new Audio(resolvedRef);
      this.activeAudio = audio;
      audio.play().catch(() => {
        this._fallbackWebSpeech(text, rate);
      });
      return;
    }

    this._fallbackWebSpeech(text, rate);
  }

  _fallbackWebSpeech(text, rate) {
    if (this.audioSynth) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-MX';
      utterance.rate = rate;
      this.audioSynth.speak(utterance);
    }
  }

  // --- MODE 1: VOCABULARY EXPLORER ---
  renderVocabularyMode(item) {
    const srsState = this.srs.peekItemState ? this.srs.peekItemState(item.id) : this.srs.getItemState(item.id);
    return `
      <div class="card p-6 glass-panel animate-fade-in">
        <div class="flex justify-between items-start mb-4">
          <div>
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">${item.cefrLevel}</span>
            <span class="badge badge-outline ml-2 text-xs">Freq: #${item.frequencyRank}</span>
            <span class="badge badge-secondary ml-2 text-xs">${item.partOfSpeech}</span>
            ${item.audioRef ? '<span class="badge badge-outline ml-2 text-[10px] text-emerald-400 border-emerald-700">Neural MP3</span>' : '<span class="badge badge-outline ml-2 text-[10px] text-slate-400">Local TTS</span>'}
          </div>
          <div class="text-right">
            <span class="text-xs text-muted">SRS Stage: ${srsState.stage}/7</span>
            <div class="text-xs font-mono text-emerald-400">Next: ${srsState.intervalDays}d</div>
          </div>
        </div>

        <div class="my-4 text-center">
          <h1 class="text-5xl font-black tracking-tight text-white mb-2 flex items-center justify-center gap-3">
            ${item.word}
            <button onclick="window.SAOS.speak('${item.word}', 1.0, '${item.audioRef || ''}')" class="btn-icon" title="Normal Speed [Key: R]">🔊</button>
            <button onclick="window.SAOS.speak('${item.word}', 0.75, '${item.slowAudioRef || ''}')" class="btn-icon text-sm" title="Slow Speed [Key: S]">🐢</button>
          </h1>
          <p class="text-lg text-emerald-400 font-mono">/${item.ipa}/ • <span class="text-slate-400">${item.syllabification}</span></p>
          <p class="text-xs text-slate-500 mt-1 uppercase font-semibold">Stress: ${item.stressType}</p>
        </div>

        <div id="vocab-reveal-panel" class="space-y-6">
          <div class="my-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-xs uppercase font-bold text-slate-400 tracking-wider">Translations</h3>
              <span class="text-[10px] font-mono text-slate-500">[Space] Toggle Reveal • [R] Audio • [S] Slow</span>
            </div>
            <p class="text-xl font-medium text-slate-100">${item.translations.en.join('; ')}</p>
          </div>

          <div class="my-6 p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-emerald-400">🌱</span>
              <h3 class="text-xs uppercase font-bold text-emerald-300 tracking-wider">Root & Morphological Family</h3>
            </div>
            <p class="text-sm text-slate-300"><strong class="text-white">Root:</strong> ${item.root} ${item.prefix ? `• <strong class="text-white">Prefix:</strong> ${item.prefix}` : ''} ${item.suffix ? `• <strong class="text-white">Suffix:</strong> ${item.suffix}` : ''}</p>
            <p class="text-sm text-slate-300"><strong class="text-white">Family:</strong> ${item.familyName}</p>
          </div>

          <div class="my-6">
            <h3 class="text-xs uppercase font-bold text-slate-400 tracking-wider mb-3">Contextual Validated Sentences (i+1)</h3>
            <div class="space-y-3">
              ${item.examples.map((ex) => `
                <div class="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition">
                  <div class="flex justify-between items-start gap-2">
                    <p class="text-base text-slate-100 font-medium">${ex.es}</p>
                    <div class="flex gap-1.5 shrink-0">
                      <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 1.0, '${ex.audioRef || ''}')" class="btn-icon" title="Normal Speed">🔊</button>
                      <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 0.75, '${ex.slowAudioRef || ''}')" class="btn-icon text-xs" title="Slow Speed">🐢</button>
                    </div>
                  </div>
                  <p class="text-sm text-slate-400 mt-1">${ex.en}</p>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="my-6">
            <h3 class="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2">Key Collocations</h3>
            <div class="flex flex-wrap gap-2">
              ${item.collocations.map(c => `
                <span class="px-3 py-1 bg-slate-800/80 rounded-full text-xs text-slate-300 border border-slate-700 font-mono">${c}</span>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <span class="text-xs text-slate-400">Evaluate recall <span class="font-mono text-slate-500">(Keys 1–4)</span>:</span>
          <div class="flex gap-2">
            <button onclick="window.SAOS.gradeItem('${item.id}', 1)" class="btn btn-error btn-sm">[1] Again (0d)</button>
            <button onclick="window.SAOS.gradeItem('${item.id}', 3)" class="btn btn-warning btn-sm">[2] Hard</button>
            <button onclick="window.SAOS.gradeItem('${item.id}', 4)" class="btn btn-primary btn-sm">[3] Good</button>
            <button onclick="window.SAOS.gradeItem('${item.id}', 5)" class="btn btn-success btn-sm">[4] Easy</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 2: ROOT FAMILIES MATRIX (100 Navigatable Root Pages) ---
  renderRootFamiliesMode(familyId) {
    const famIdx = Math.max(0, this.corpus.rootFamilies.findIndex(f => f.id === familyId));
    const family = this.corpus.rootFamilies[famIdx] || this.corpus.rootFamilies[0];
    const relatedLexemes = this.corpus.lexicon.filter(l => l.familyId === family.id);
    const affixPatterns = family.affixPatterns || [
      { affix: "con- / co-", type: "prefix", semanticShift: `Joint or collective ${family.meaning.toLowerCase()}` },
      { affix: "re-", type: "prefix", semanticShift: `Iterative or intensified ${family.meaning.toLowerCase()}` },
      { affix: "-ción / -miento", type: "suffix", semanticShift: `Nominalized process or result of ${family.root}` },
      { affix: "-able / -ible / -ivo", type: "suffix", semanticShift: `Adjectival capacity or active tendency of ${family.root}` }
    ];

    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Root Family #${famIdx + 1} of ${this.corpus.rootFamilies.length}</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevFamily('${family.id}')" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white hover:border-emerald-500 transition">← Prev Root [←]</button>
            <button onclick="window.SAOS.nextFamily('${family.id}')" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white hover:border-emerald-500 transition">Next Root [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in rounded-2xl">
          <div class="flex items-center justify-between mb-4">
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">Morphological Lever • Page ${famIdx + 1}/${this.corpus.rootFamilies.length}</span>
            <span class="text-xs font-mono text-emerald-400 font-bold">Unlock Multiplier: ${family.unlockMultiplier || 18}x</span>
          </div>

          <h1 class="text-4xl font-extrabold text-white mb-1">${family.root}</h1>
          <p class="text-slate-300 text-sm mb-2">${family.etymology || family.origin || 'Latin Etymological Stem'} — <strong class="text-emerald-300">${family.meaning}</strong></p>
          ${family.cognitiveHook ? `<p class="text-xs text-slate-400 italic mb-4">💡 ${family.cognitiveHook}</p>` : ''}

          <div class="my-6 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <h3 class="text-xs uppercase font-bold text-slate-400 tracking-wider mb-3">Productive Affix Patterns</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              ${affixPatterns.map(p => `
                <div class="p-3 bg-slate-800/40 rounded-lg border border-slate-700/60">
                  <span class="font-mono text-emerald-400 font-bold text-sm">${p.affix}</span>
                  <span class="badge badge-outline text-[10px] ml-2">${p.type}</span>
                  <p class="text-xs text-slate-300 mt-1">${p.semanticShift}</p>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="my-6">
            <h3 class="text-xs uppercase font-bold text-slate-400 tracking-wider mb-3">Derived Lexemes in Corpus (${relatedLexemes.length} Indexed)</h3>
            <div class="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
              ${relatedLexemes.slice(0, 40).map(lex => `
                <button onclick="window.SAOS.viewWord('${lex.word}')" class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition bg-emerald-950/70 border border-emerald-700/70 text-emerald-200 hover:bg-emerald-800">
                  <strong class="text-white">${lex.word}</strong> <span class="text-emerald-400/80">(${lex.cefrLevel})</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
            <button onclick="window.SAOS.prevFamily('${family.id}')" class="btn btn-outline btn-sm">← Prev Root [←]</button>
            <span class="text-xs font-mono text-slate-400">Use Left/Right Arrows to browse all 100 roots</span>
            <button onclick="window.SAOS.nextFamily('${family.id}')" class="btn btn-primary btn-sm">Next Root [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 3: LISTENING ACQUISITION (10,000 Navigatable Audio Tracks) ---
  renderListeningMode(item, currentIdx = 0) {
    const example = item.examples[0];
    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Listening Track #${(currentIdx + 1).toLocaleString()} of ${this.corpus.lexicon.length.toLocaleString()} • CEFR ${item.cefrLevel}</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Track [←]</button>
            <button onclick="window.SAOS.nextWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Track [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in text-center rounded-2xl">
          <div class="flex justify-between items-center mb-4">
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">Acoustic Shield (Zero Visual Clues)</span>
            <span class="badge badge-outline text-xs font-mono">Root: ${item.root}</span>
          </div>
          <h2 class="text-2xl font-bold text-white mb-2">Auditory Recognition & Shadowing Drill</h2>
          <p class="text-sm text-slate-300 mb-6">Listen to the native stream before revealing the transcript. Press <kbd class="px-1.5 py-0.5 bg-slate-800 rounded text-xs">R</kbd> (normal) or <kbd class="px-1.5 py-0.5 bg-slate-800 rounded text-xs">S</kbd> (slow).</p>

          <div class="my-6 flex justify-center items-center gap-6">
            <button onclick="window.SAOS.speak('${example.es.replace(/'/g, "\\'")}', 1.0, '${example.audioRef || ''}')" class="w-20 h-20 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex flex-col items-center justify-center shadow-lg shadow-emerald-900/50 transition transform hover:scale-105">
              <span class="text-2xl">🔊</span>
              <span class="text-[10px] font-mono mt-0.5">1.0x</span>
            </button>
            <button onclick="window.SAOS.speak('${example.es.replace(/'/g, "\\'")}', 0.75, '${example.slowAudioRef || ''}')" class="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex flex-col items-center justify-center border border-slate-600 transition transform hover:scale-105">
              <span class="text-xl">🐢</span>
              <span class="text-[10px] font-mono mt-0.5">0.75x</span>
            </button>
            <button onclick="window.SAOS.speak('${item.word.replace(/'/g, "\\'")}', 1.0, '${item.audioRef || ''}')" class="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-emerald-300 flex flex-col items-center justify-center border border-slate-600 transition transform hover:scale-105" title="Play isolated target word">
              <span class="text-lg">🎯</span>
              <span class="text-[10px] font-mono mt-0.5">Word</span>
            </button>
          </div>

          <div id="listening-reveal" class="hidden my-6 p-5 rounded-xl bg-slate-900/90 border border-slate-700 text-left animate-fade-in space-y-3">
            ${item.examples.map((ex, i) => `
              <div class="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex justify-between items-start gap-2">
                <div>
                  <p class="text-base font-bold text-white">${i + 1}. ${ex.es}</p>
                  <p class="text-xs text-slate-400 mt-0.5">${ex.en}</p>
                </div>
                <div class="flex gap-1 shrink-0">
                  <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 1.0, '${ex.audioRef || ''}')" class="btn-icon text-xs">🔊</button>
                  <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 0.75, '${ex.slowAudioRef || ''}')" class="btn-icon text-xs">🐢</button>
                </div>
              </div>
            `).join('')}
            <div class="p-3 bg-emerald-950/40 rounded-lg border border-emerald-800/40 text-xs text-emerald-300 flex justify-between items-center">
              <span><strong>Target Lexeme:</strong> ${item.word} (/${item.ipa}/) — ${item.translations.en.join('; ')}</span>
              <span class="font-mono">${item.familyName}</span>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-slate-800">
            <button onclick="window.SAOS.prevWord()" class="btn btn-outline btn-sm">← Prev [←]</button>
            <button id="listening-reveal-btn" onclick="document.getElementById('listening-reveal').classList.remove('hidden'); this.classList.add('hidden'); document.getElementById('listening-grades').classList.remove('hidden');" class="btn btn-primary px-6">
              Reveal Transcript & All 3 Sentences
            </button>
            <div id="listening-grades" class="hidden flex gap-2">
              <button onclick="window.SAOS.gradeItem('${item.id}', 1, 'listening')" class="btn btn-error btn-sm">[1] Missed</button>
              <button onclick="window.SAOS.gradeItem('${item.id}', 3, 'listening')" class="btn btn-warning btn-sm">[2] Partial</button>
              <button onclick="window.SAOS.gradeItem('${item.id}', 5, 'listening')" class="btn btn-success btn-sm">[4] 100% Clear</button>
            </div>
            <button onclick="window.SAOS.nextWord()" class="btn btn-outline btn-sm">Next [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 4: READING IMMERSION (12 Multi-Page Historical & Analytical Passages) ---
  getReadingPassages() {
    return [
      {
        title: "1. Crónica sobre el Desarrollo Sostenible y la Vida Urbana",
        cefr: "B1 / B2",
        domain: "Urbanism & Ecology",
        paragraphs: [
          `Durante siglos, las comunidades buscaron <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('mantener')">mantener</span> el equilibrio entre el crecimiento económico y la <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('supervivencia')">supervivencia</span> de sus recursos naturales. El acceso a una <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('vivienda')">vivienda</span> digna ha sido un tema recurrente en las asambleas ciudadanas.`,
          `Los urbanistas contemporáneos han decidido <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('proponer')">proponer</span> nuevos paradigmas arquitectónicos, asegurando que cada espacio <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('disponible')">disponible</span> sea utilizado de manera <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('sostenible')">sostenible</span>. Resulta imprescindible <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('prevenir')">prevenir</span> la sobreexplotación antes de que sea imposible <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('convivir')">convivir</span> en armonía.`
        ],
        plainText: "Durante siglos, las comunidades buscaron mantener el equilibrio entre el crecimiento económico y la supervivencia de sus recursos naturales."
      },
      {
        title: "2. Historiografía y Transmisión de Manuscritos en Al-Ándalus",
        cefr: "B2 / C1",
        domain: "Iberian History & Epigraphy",
        paragraphs: [
          `En las bibliotecas de Córdoba y Toledo, los traductores lograron <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('transmitir')">transmitir</span> tratados científicos que habían logrado <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('sobrevivir')">sobrevivir</span> a la fragmentación del mundo antiguo. Su labor permitió <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('introducir')">introducir</span> conceptos matemáticos fundamentales en Europa.`,
          `Cada escuela de copistas buscaba <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('componer')">componer</span> glosarios bilingües y <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('revisar')">revisar</span> minuciosamente las fuentes griegas y árabes. Esta extraordinaria <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('convivencia')">convivencia</span> intelectual demostró ser sumamente <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('productivo')">productivo</span> para la ciencia occidental.`
        ],
        plainText: "En las bibliotecas de Córdoba y Toledo, los traductores lograron transmitir tratados científicos que habían logrado sobrevivir a la fragmentación del mundo antiguo."
      },
      {
        title: "3. Jurisprudencia, Soberanía y Tratados Constitucionales",
        cefr: "C1",
        domain: "Constitutional Law & Governance",
        paragraphs: [
          `Ningún tribunal puede <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('imponer')">imponer</span> sanciones arbitrarias ni <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('contradecir')">contradecir</span> los principios fundamentales que la carta magna establece. Cuando las partes deciden <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('intervenir')">intervenir</span> en un litigio, el magistrado debe <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('emitir')">emitir</span> un dictamen fundado.`,
          `La doctrina jurídica exige <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('prever')">prever</span> las consecuencias institucionales antes de <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('someter')">someter</span> una reforma a votación parlamentaria, evitando así cualquier <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('contradicción')">contradicción</span> normativa.`
        ],
        plainText: "Ningún tribunal puede imponer sanciones arbitrarias ni contradecir los principios fundamentales que la carta magna establece."
      },
      {
        title: "4. Logística Estratégica e Infraestructura de Transporte",
        cefr: "B2",
        domain: "Infrastructure & Economics",
        paragraphs: [
          `Para <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('reducir')">reducir</span> los tiempos de entrega en el comercio marítimo, las autoridades portuarias decidieron <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('disponer')">disponer</span> corredores automatizados capaces de <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('conducir')">conducir</span> mercancías hacia el interior continental.`,
          `El proyecto demostró ser técnicamente <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('factible')">factible</span> y permitió <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('obtener')">obtener</span> un <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('beneficio')">beneficio</span> logístico sin precedentes para la región exportadora.`
        ],
        plainText: "Para reducir los tiempos de entrega en el comercio marítimo, las autoridades portuarias decidieron disponer corredores automatizados."
      },
      {
        title: "5. Epistemología Científica y Verificación Empírica",
        cefr: "C1 / C2",
        domain: "Philosophy of Science",
        paragraphs: [
          `En las ciencias experimentales, no basta con <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('suponer')">suponer</span> una hipótesis ni <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('predecir')">predecir</span> un fenómeno de forma intuitiva; es indispensable <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('producir')">producir</span> pruebas reproducibles que sean <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('evidente')">evidente</span>s ante cualquier observador independiente.`,
          `Cuando los datos empíricos obligan a <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('revisar')">revisar</span> un modelo clásico, el investigador debe <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('admitir')">admitir</span> las anomalías y <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('exponer')">exponer</span> sus hallazgos con rigor metodológico.`
        ],
        plainText: "En las ciencias experimentales, no basta con suponer una hipótesis ni predecir un fenómeno de forma intuitiva."
      },
      {
        title: "6. Diplomacia Internacional y Resolución de Conflictos",
        cefr: "B2 / C1",
        domain: "International Relations",
        paragraphs: [
          `Los enviados diplomáticos lograron <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('convenir')">convenir</span> un armisticio duradero tras semanas de intensas deliberaciones. Ambas delegaciones acordaron <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('contener')">contener</span> las hostilidades fronterizas y <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('retener')">retener</span> únicamente posiciones defensivas verificadas.`,
          `El mediador internacional supo <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('sostener')">sostener</span> el diálogo bilateral y <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('satisfacer')">satisfacer</span> las garantías mínimas exigidas por los tratados vigentes.`
        ],
        plainText: "Los enviados diplomáticos lograron convenir un armisticio duradero tras semanas de intensas deliberaciones."
      },
      {
        title: "7. Filología Hispánica y Evolución de las Raíces Latinas",
        cefr: "C1 / C2",
        domain: "Romance Linguistics",
        paragraphs: [
          `El estudio etimológico permite <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('ver')">ver</span> cómo un solo étimo latino consigue <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('producir')">producir</span> docenas de derivados cultos y patrimoniales. Quien comprende la estructura prefijal puede <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('deducir')">deducir</span> el significado de voces complejas sin recurrir constantemente al diccionario.`,
          `Así, verbos de alta frecuencia como <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('poner')">poner</span>, <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('tener')">tener</span>, <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('decir')">decir</span> y <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('hacer')">hacer</span> constituyen la columna vertebral de la morfología derivativa española.`
        ],
        plainText: "El estudio etimológico permite ver cómo un solo étimo latino consigue producir docenas de derivados cultos y patrimoniales."
      },
      {
        title: "8. Ciberseguridad de Infraestructuras Críticas",
        cefr: "B2 / C1",
        domain: "Cybersecurity & Zero-Trust",
        paragraphs: [
          `Los arquitectos de seguridad buscan <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('prevenir')">prevenir</span> intrusiones mediante protocolos de confianza cero que impiden <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('exponer')">exponer</span> credenciales sensibles. Ningún nodo externo puede <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('intervenir')">intervenir</span> en el núcleo operativo sin verificación criptográfica.`,
          `Cuando los sensores logran <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('prever')">prever</span> un vector de ataque, el sistema procede a <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('contener')">contener</span> el tráfico anómalo y <span class="word-chip cursor-pointer text-emerald-400 underline font-semibold" onclick="window.SAOS.inspectWordInReader('emitir')">emitir</span> alertas inmediatas al centro de mando.`
        ],
        plainText: "Los arquitectos de seguridad buscan prevenir intrusiones mediante protocolos de confianza cero que impiden exponer credenciales sensibles."
      }
    ];
  }

  renderReadingMode() {
    if (typeof this.readingCursor !== 'number') this.readingCursor = 0;
    const passages = this.getReadingPassages();
    const idx = ((this.readingCursor % passages.length) + passages.length) % passages.length;
    const p = passages[idx];

    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Reading Passage #${idx + 1} of ${passages.length} • ${p.domain}</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevReading()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Passage [←]</button>
            <button onclick="window.SAOS.nextReading()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Passage [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in rounded-2xl">
          <div class="flex flex-wrap justify-between items-center gap-2 mb-5">
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">Comprehensible Input Reader (i+1)</span>
            <div class="flex items-center gap-2">
              <span class="badge badge-outline text-xs font-mono">CEFR ${p.cefr}</span>
              <button onclick="window.SAOS.speak('${p.plainText.replace(/'/g, "\\'")}', 1.0)" class="btn btn-outline btn-xs">🔊 Read Aloud</button>
            </div>
          </div>

          <article class="prose prose-invert max-w-none text-lg leading-relaxed text-slate-200 space-y-4">
            <h2 class="text-2xl font-black text-white mb-3">${p.title}</h2>
            ${p.paragraphs.map(para => `<p>${para}</p>`).join('')}
          </article>

          <div id="reader-inspector" class="mt-6 p-4 rounded-xl bg-slate-900/95 border border-emerald-600/50 text-sm hidden">
            <div class="flex justify-between items-center">
              <h4 id="reader-word-title" class="font-bold text-white text-base"></h4>
              <span id="reader-word-cefr" class="badge badge-accent"></span>
            </div>
            <p id="reader-word-gloss" class="text-slate-200 mt-1 font-medium"></p>
            <p id="reader-word-root" class="text-emerald-400 text-xs font-mono mt-1"></p>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
            <button onclick="window.SAOS.prevReading()" class="btn btn-outline btn-sm">← Prev Passage [←]</button>
            <span class="text-xs text-slate-400 font-mono">Click any underlined emerald word to inspect root & audio</span>
            <button onclick="window.SAOS.nextReading()" class="btn btn-primary btn-sm">Next Passage [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 5: PRONUNCIATION & SHADOWING LAB (10,000 Navigatable Targets) ---
  renderPronunciationLab(item, currentIdx = 0) {
    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Phonetic Target #${(currentIdx + 1).toLocaleString()} of ${this.corpus.lexicon.length.toLocaleString()}</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Target [←]</button>
            <button onclick="window.SAOS.nextWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Target [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in rounded-2xl">
          <div class="flex justify-between items-center mb-4">
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">Prosodic & Phonetic Lab</span>
            <span class="badge badge-outline text-xs font-mono">${item.cefrLevel} • ${item.partOfSpeech}</span>
          </div>
          <h2 class="text-4xl font-black text-white mb-1">${item.word}</h2>
          <p class="text-sm text-slate-300 mb-4">${item.translations.en.join('; ')}</p>
          
          <div class="my-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
            <div class="p-4 bg-slate-900/70 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400 font-semibold uppercase mb-1">IPA Transcription</div>
              <div class="text-xl font-mono text-emerald-400">/${item.ipa}/</div>
            </div>
            <div class="p-4 bg-slate-900/70 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400 font-semibold uppercase mb-1">Syllable Division</div>
              <div class="text-xl font-bold text-white tracking-widest">${item.syllabification}</div>
            </div>
            <div class="p-4 bg-slate-900/70 rounded-xl border border-slate-800">
              <div class="text-xs text-slate-400 font-semibold uppercase mb-1">Prosodic Stress</div>
              <div class="text-sm font-semibold text-emerald-300 mt-1">${item.stressType}</div>
            </div>
          </div>

          <div class="my-5 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
            <h3 class="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2">Dual-Pace Shadowing Protocol</h3>
            <div class="flex gap-3 mb-4">
              <button onclick="window.SAOS.speak('${item.word.replace(/'/g, "\\'")}', 1.0, '${item.audioRef || ''}')" class="btn btn-primary flex-1">🔊 Normal Native Pace [R]</button>
              <button onclick="window.SAOS.speak('${item.word.replace(/'/g, "\\'")}', 0.75, '${item.slowAudioRef || ''}')" class="btn btn-outline flex-1">🐢 Slow Articulated Pace [S]</button>
            </div>
            <div class="space-y-2">
              ${item.examples.map((ex, i) => `
                <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex justify-between items-center text-xs">
                  <span class="text-slate-200">${i + 1}. ${ex.es}</span>
                  <div class="flex gap-1 shrink-0 ml-2">
                    <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 1.0, '${ex.audioRef || ''}')" class="btn-icon text-xs">🔊</button>
                    <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 0.75, '${ex.slowAudioRef || ''}')" class="btn-icon text-xs">🐢</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
            <button onclick="window.SAOS.prevWord()" class="btn btn-outline btn-sm">← Prev Target [←]</button>
            <span class="text-xs font-mono text-slate-400">Pure tense vowels • No diphthong glide</span>
            <button onclick="window.SAOS.nextWord()" class="btn btn-primary btn-sm">Next Target [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 6: DERIVATION FORGE (10,000 Navigatable Morphological Matrices) ---
  renderDerivationForge(item, currentIdx = 0) {
    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Derivation Matrix #${(currentIdx + 1).toLocaleString()} of ${this.corpus.lexicon.length.toLocaleString()}</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Matrix [←]</button>
            <button onclick="window.SAOS.nextWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Matrix [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in rounded-2xl">
          <div class="flex justify-between items-center mb-4">
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">Morphological Synthesis</span>
            <span class="badge badge-outline text-xs font-mono">Family: ${item.familyName}</span>
          </div>
          <h2 class="text-2xl font-bold text-white mb-1">Derivation Forge: ${item.word}</h2>
          <p class="text-xs text-slate-300 mb-4">Deconstruct and synthesize the target lexeme from its productive prefix, Latin/Spanish root stem, and derivational suffix.</p>

          <div class="p-6 rounded-2xl bg-slate-900/85 border border-slate-800 my-4 text-center">
            <span class="text-xs uppercase tracking-wider text-slate-400 font-bold">Target Semantic Concept (${item.partOfSpeech} • ${item.cefrLevel})</span>
            <div class="text-2xl font-bold text-white mt-1 mb-4">${item.translations.en.join('; ')}</div>

            <div class="flex flex-wrap items-center justify-center gap-3 my-5">
              <div class="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl font-mono text-emerald-400 font-bold">
                <div class="text-[10px] text-slate-400 uppercase">Prefix</div>
                ${item.prefix || 'Ø (base)'}
              </div>
              <span class="text-slate-500 font-bold text-xl">+</span>
              <div class="px-5 py-3 bg-emerald-950/80 border border-emerald-500 rounded-xl font-mono text-white font-bold text-lg">
                <div class="text-[10px] text-emerald-300 uppercase">Root Stem</div>
                ${item.root}
              </div>
              <span class="text-slate-500 font-bold text-xl">+</span>
              <div class="px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl font-mono text-emerald-400 font-bold">
                <div class="text-[10px] text-slate-400 uppercase">Suffix</div>
                ${item.suffix || 'Ø (inf.)'}
              </div>
            </div>

            <div class="text-3xl font-black text-emerald-300 tracking-wide flex items-center justify-center gap-3">
              <span>= ${item.word}</span>
              <button onclick="window.SAOS.speak('${item.word.replace(/'/g, "\\'")}', 1.0, '${item.audioRef || ''}')" class="btn-icon text-base">🔊</button>
            </div>
          </div>

          <div class="my-4">
            <h4 class="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2">Related Derivatives & Collocations</h4>
            <div class="flex flex-wrap gap-2">
              ${(item.derivatives || []).map(d => `
                <button onclick="window.SAOS.viewWord('${d.word}')" class="px-3 py-1.5 bg-slate-800/70 hover:bg-slate-700 rounded-lg border border-slate-700 text-xs text-slate-200 transition">
                  <strong class="text-emerald-300">${d.word}</strong> (${d.pos}): ${d.gloss}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
            <button onclick="window.SAOS.prevWord()" class="btn btn-outline btn-sm">← Prev Matrix [←]</button>
            <button onclick="window.SAOS.currentFamilyId='${item.familyId}'; window.SAOS.switchMode('roots')" class="btn btn-outline btn-xs text-emerald-300">Inspect Full ${item.root} Family →</button>
            <button onclick="window.SAOS.nextWord()" class="btn btn-primary btn-sm">Next Matrix [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 7: TRANSLATION LADDER (10,000 Dynamic 5-Layer Deconstructions) ---
  renderTranslationLadder(item, currentIdx = 0) {
    const ex = item.examples[0];
    const wordsEs = ex.es.split(/\s+/);
    const literalTokens = wordsEs.map(w => {
      const clean = w.replace(/[.,;?!"]/g, '');
      if (clean.toLowerCase() === item.word.toLowerCase()) {
        return `[${clean} :: ${item.prefix ? item.prefix + '+' : ''}${item.root}${item.suffix ? '+' + item.suffix : ''} = "${item.translations.en[0]}"]`;
      }
      return clean;
    }).join(' · ');

    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Translation Ladder #${(currentIdx + 1).toLocaleString()} of ${this.corpus.lexicon.length.toLocaleString()}</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Sentence [←]</button>
            <button onclick="window.SAOS.nextWord()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Sentence [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in rounded-2xl">
          <div class="flex justify-between items-center mb-4">
            <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">5-Layer Deconstructive Translation</span>
            <span class="badge badge-outline text-xs font-mono">${item.word} (${item.cefrLevel})</span>
          </div>

          <div class="p-4 bg-slate-900/90 rounded-xl border border-slate-700 mb-5 flex justify-between items-center gap-3">
            <div>
              <span class="text-[10px] uppercase text-emerald-400 font-bold font-mono">Source Spanish Clause</span>
              <p class="text-xl font-bold text-white mt-0.5">${ex.es}</p>
            </div>
            <div class="flex gap-1.5 shrink-0">
              <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 1.0, '${ex.audioRef || ''}')" class="btn-icon">🔊</button>
              <button onclick="window.SAOS.speak('${ex.es.replace(/'/g, "\\'")}', 0.75, '${ex.slowAudioRef || ''}')" class="btn-icon text-xs">🐢</button>
            </div>
          </div>

          <div class="space-y-3">
            <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800">
              <span class="badge badge-outline mb-1 font-mono text-[10px]">Layer 1: Morpheme & Lexical Segmentation</span>
              <p class="text-xs text-emerald-300 font-mono mt-1 leading-relaxed">${literalTokens}</p>
            </div>

            <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800">
              <span class="badge badge-outline mb-1 font-mono text-[10px]">Layer 2: Validated Idiomatic English Equivalence</span>
              <p class="text-base text-slate-100 font-medium mt-1">${ex.en}</p>
            </div>

            <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800">
              <span class="badge badge-outline mb-1 font-mono text-[10px]">Layer 3: Secondary Contextual Permutations</span>
              <p class="text-xs text-slate-300 mt-1">${item.examples.slice(1).map(e => `• "${e.es}" → <em>${e.en}</em>`).join('<br/>')}</p>
            </div>

            <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800">
              <span class="badge badge-outline mb-1 font-mono text-[10px]">Layer 4: Etymological & Collocational Register</span>
              <p class="text-xs text-slate-300 mt-1">Root <code class="text-emerald-400">${item.root}</code> (${item.familyName}) • Frequency Rank <code class="text-emerald-400">#${item.frequencyRank}</code> • Collocations: <em>${item.collocations.join(', ')}</em>.</p>
            </div>

            <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800">
              <span class="badge badge-outline mb-1 font-mono text-[10px]">Layer 5: RAE Syntactic & Morphological Classification</span>
              <p class="text-xs text-slate-300 mt-1">Part of Speech: <strong class="text-white">${item.partOfSpeech}</strong> • Prosodic stress: <strong class="text-white">${item.stressType}</strong> (<code>${item.syllabification}</code>) • Diagnostic Tag: <code>${(item.diagnosticTags || []).join(', ')}</code>.</p>
            </div>
          </div>

          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
            <button onclick="window.SAOS.prevWord()" class="btn btn-outline btn-sm">← Prev Sentence [←]</button>
            <span class="text-xs font-mono text-slate-400">Use ← / → arrows to step through all 10,000 items</span>
            <button onclick="window.SAOS.nextWord()" class="btn btn-primary btn-sm">Next Sentence [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 8: DYNAMIC DIAGNOSTICS ASSESSMENT ---
  generateDynamicDiagnostic(overrideFamilyId = null) {
    const weakestFamId = overrideFamilyId || (this.srs.getWeakestFamilyId ? this.srs.getWeakestFamilyId(this.corpus.rootFamilies) : 'fam_ten');
    const familyMembers = this.corpus.lexicon.filter(l => l.familyId === weakestFamId);
    const pool = familyMembers.length >= 3 ? familyMembers : this.corpus.lexicon.slice(0, 43);

    if (typeof this.diagCursor !== 'number') this.diagCursor = 0;
    const safeIdx = ((this.diagCursor % pool.length) + pool.length) % pool.length;
    const target = pool[safeIdx];
    const ex = target.examples[0] || { es: `Es fundamental ${target.word} correctamente.`, en: `It is essential to use ${target.word} correctly.` };

    const escapedWord = target.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    const clozeSentence = regex.test(ex.es)
      ? ex.es.replace(regex, '_______________')
      : `${ex.es} (Target: _______________)`;

    const siblings = pool.filter(m => m.id !== target.id).slice(0, 2);
    const crossPool = this.corpus.lexicon.filter(l => l.familyId !== target.familyId);
    const crossDistractor = crossPool[(safeIdx * 7) % crossPool.length];

    const rawOptions = [
      { item: target, isCorrect: true },
      ...siblings.map(s => ({ item: s, isCorrect: false })),
      ...(crossDistractor ? [{ item: crossDistractor, isCorrect: false }] : [])
    ].slice(0, 4);

    const shift = safeIdx % rawOptions.length;
    const options = [...rawOptions.slice(shift), ...rawOptions.slice(0, shift)];

    this.currentDiagnostic = {
      probeNumber: safeIdx + 1,
      totalInPool: pool.length,
      familyId: weakestFamId,
      target,
      example: ex,
      clozeSentence,
      options
    };
    return this.currentDiagnostic;
  }

  renderDiagnosticsMode(overrideFamilyId = null) {
    const diag = this.generateDynamicDiagnostic(overrideFamilyId);
    const famObj = this.corpus.rootFamilies.find(f => f.id === diag.familyId) || { root: diag.target.root, meaning: diag.target.familyName };
    const famErrors = (this.srs.state && this.srs.state._diagnostics && this.srs.state._diagnostics.familyErrors) || {};
    const errCount = famErrors[diag.familyId] || 0;
    const letters = ['A', 'B', 'C', 'D'];

    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono">Diagnostic Probe #${diag.probeNumber} of ${diag.totalInPool} (${famObj.root})</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevDiagnostic()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Probe [←]</button>
            <button onclick="window.SAOS.nextDiagnostic()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Probe [→] →</button>
          </div>
        </div>

        <div class="card p-6 glass-panel animate-fade-in rounded-2xl">
          <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div class="flex items-center gap-2">
              <span class="badge badge-accent uppercase tracking-wider text-xs font-bold">Dynamic Diagnostic Generator</span>
              <span class="badge badge-outline text-xs font-mono">Weakest Root: ${famObj.root} (Errors: ${errCount})</span>
            </div>
            <span class="text-xs font-mono text-slate-400">Keys [1–4] Answer • [←/→] Navigate</span>
          </div>

          <h2 class="text-2xl font-bold text-white mb-1">Adaptive Morphological & Syntactic Probe</h2>
          <p class="text-xs text-slate-300 mb-4">Dynamically pulls sibling derivatives from your highest-lapse root family (<strong class="text-emerald-300">${famObj.root} — ${famObj.meaning}</strong>) to isolate prefix/suffix/POS boundaries.</p>

          <div class="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 my-4">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs uppercase text-emerald-400 font-bold font-mono">Target POS: ${diag.target.partOfSpeech.toUpperCase()} • CEFR ${diag.target.cefrLevel}</span>
              <span class="text-xs text-slate-400 font-mono">Probe #${diag.probeNumber}</span>
            </div>

            <p class="text-lg text-white font-medium my-3 leading-relaxed">
              "${diag.clozeSentence}"
            </p>
            <p class="text-xs text-slate-400 italic mb-4">English Cue: "${diag.example.en}"</p>

            <div class="space-y-2.5 mt-4">
              ${diag.options.map((opt, idx) => `
                <button onclick="window.SAOS.checkDiagnostic(${idx})" class="w-full text-left p-3.5 rounded-xl bg-slate-800/80 hover:bg-emerald-950/80 hover:border-emerald-600 border border-slate-700 transition text-sm text-slate-200 flex justify-between items-center">
                  <span><strong class="text-emerald-400 font-mono mr-2">[${idx + 1}] ${letters[idx]})</strong> ${opt.item.word}</span>
                  <span class="text-xs text-slate-400 font-mono">Root: ${opt.item.root} • ${opt.item.partOfSpeech}</span>
                </button>
              `).join('')}
            </div>
          </div>
          <div id="diagnostic-result" class="hidden p-4 rounded-xl mt-4"></div>

          <div class="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
            <button onclick="window.SAOS.prevDiagnostic()" class="btn btn-outline btn-sm">← Prev Probe [←]</button>
            <button onclick="window.SAOS.nextDiagnostic()" class="btn btn-primary btn-sm">Next Probe [→] →</button>
          </div>
        </div>
      </div>
    `;
  }

  // --- MODE 9: UNIFIED REVIEW QUEUE ---
  renderReviewQueue() {
    const dueItems = this.srs.getDueItems(this.corpus.lexicon);
    if (dueItems.length === 0) {
      return `
        <div class="card p-12 glass-panel text-center max-w-xl mx-auto rounded-2xl">
          <div class="text-6xl mb-4">🎉</div>
          <h2 class="text-3xl font-extrabold text-white mb-2">Review Queue Clear!</h2>
          <p class="text-slate-300 mb-6">No items currently due for spaced repetition. All memory traces are stabilized for their scheduled intervals.</p>
          <button onclick="window.SAOS.switchMode('vocabulary')" class="btn btn-primary">Explore 10,000 Lexemes →</button>
        </div>
      `;
    }

    if (typeof this.reviewCursor !== 'number') this.reviewCursor = 0;
    const safeIdx = ((this.reviewCursor % dueItems.length) + dueItems.length) % dueItems.length;
    const currentItem = dueItems[safeIdx];
    const st = this.srs.peekItemState ? this.srs.peekItemState(currentItem.id) : this.srs.getItemState(currentItem.id);
    return `
      <div class="w-full mx-auto">
        <div class="flex justify-between items-center mb-3 px-2 text-xs text-slate-300">
          <span class="font-mono text-emerald-400 font-bold">Queue Card #${safeIdx + 1} of ${dueItems.length} Due (Stage ${st.stage}/7)</span>
          <div class="flex items-center gap-2">
            <button onclick="window.SAOS.prevReviewCard()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">← Prev Due [←]</button>
            <button onclick="window.SAOS.nextReviewCard()" class="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700 hover:text-white transition">Next Due [→] →</button>
          </div>
        </div>
        ${this.renderVocabularyMode(currentItem)}
      </div>
    `;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { LearningModesEngine };
}
