# Motion AI benchmark

29 Sep 2026 7:48:49am  |  40 prompts

| provider | model | valid recipe | checks passed | mean latency | tokens in / out (mean) | est. cost / request |
|---|---|---|---|---|---|---|
| Ollama (local) | chatgpt1/qwythos-9b-claude-mythos-5-1m-abliterated:latest | 39 / 40 | 50 / 67 (75 %) | 22.4 s | 2437 / 1432 | 0 (local) / n.a. |

Checks are directional (a darker request must come back darker than the base, etc.), not taste. Valid recipe = parsed and validated by the same code the plugin uses.

## Ollama (local) | chatgpt1/qwythos-9b-claude-mythos-5-1m-abliterated:latest

- `rumble-01` rumble de armazém escuro que respira com o kick -> **Armazém Escuro** 3/4 (failed: motion > 1)
- `rumble-02` sub grave hipnótico em F, longo, que não pisa o kick -> **F-Sub Hypno** 3/3
- `rumble-03` deep rolling rumble like Mulero, dark and heavy -> **Dark Rumble** 2/2
- `rumble-04` rumble curto e seco, quase sem cauda -> **Short Rumble** 2/2
- `rumble-05` grave que vai abrindo ao longo de 4 compassos -> **Grave Abre** 0/1 (failed: a lane at 4 BARS or slower)
- `ferro-01` ferro industrial, chapas a bater, metálico -> **Ferro Industrial** 1/1
- `ferro-02` sinos partidos com delay curto em ping-pong -> **Quebrado** 0/2 (failed: resonator mode METAL, has delay)
- `ferro-03` percussão metálica afinada em G, polirritmica -> **G-Metal Poly** 2/2
- `ferro-04` canos ocos, som de tubo -> *no recipe* 0/1
- `ferro-05` metal frio e brilhante com stutter -> **Frio Brutal** 1/2 (failed: metal > 0.5)
- `sirene-01` sirene que sobe devagar, tipo alarme de túnel -> **Sirene de Túnel** 1/1
- `sirene-02` barber pole infinito a descer -> **Desce Infinito** 2/2
- `sirene-03` rising siren, wide stereo, lots of feedback -> **Siren Space** 1/2 (failed: shifter.feedback > 0.4)
- `sirene-04` ressonância que desliza como uma sirene -> **Sirene de Reso** 1/2 (failed: resonator.shift off centre)
- `dub-01` dub techno, acordes com eco a fugir para os lados -> **Dub ResoChords** 2/2
- `dub-02` delay de fita a pontilhado com wobble -> **Pontilhado Wobble** 2/2
- `dub-03` espaço enorme, reverb escura, tipo catedral de betão -> **Catedral de Betão** 0/2 (failed: has space, space.size > 0.6)
- `dub-04` Basic Channel vibe, filtered chord stabs, long delay -> **Chord Delay Cloud** 1/2 (failed: has delay)
- `dub-05` eco que se auto-alimenta sem explodir -> **Eco Auto‑Alimentado** 2/2
- `ind-01` industrial sujo, bitcrush e distorção pesada -> **Metal Sujo** 2/2
- `ind-02` gate partido em 1/16 com stutter -> **Gate Partido** 1/1
- `ind-03` raw warehouse techno, clipped and gated -> **METAL CLIP GATE** 2/2
- `ind-04` estática, rádio partido, sample rate baixo -> **Radio Ruído** 1/2 (failed: drive.rate > 0.1)
- `ind-05` fold agressivo mas com o sub limpo -> **Fold & Breath** 0/2 (failed: has drive, drive.lowkeep > 0.3)
- `mov-01` tudo a mexer em 1/16, muito movimento -> **ResoShift Engine** 0/1 (failed: motion > 2)
- `mov-02` evolução lenta, quase parada -> **Respiração Lenta** 0/1 (failed: a lane at 1 BAR or slower)
- `mov-03` filtro que abre no compasso 4 -> **Filtro Abre no Compasso 4** 1/2 (failed: a lane at 4 BARS or slower)
- `mov-04` caótico e imprevisível -> **Caos Fria** 1/1
- `mov-05` hipnótico, repetitivo, sem surpresas -> **Loop Breathing** 1/1
- `mix-01` subtil, só um toque de espaço -> **Luz do Armazém** 1/1
- `mix-02` cadeia simples: só filtro e reverb -> **Corte de Ácido** 3/3
- `en-01` dark hypnotic groove with a breathing filter -> **Dark Breathing Resonance** 2/2
- `en-02` bright metallic shimmer -> **Bright Metallic Shimmer** 2/2
- `conv-01` mais sujo -> **Sujo Warehouse** 1/1
- `conv-02` menos metálico -> **Tube Breath** 1/1
- `conv-03` mais espaço -> **Dub Ghost** 1/1
- `conv-04` mais escuro -> **Concrete Engine** 1/1
- `conv-05` mais calmo, menos caos -> **Sodium Siren Calm** 1/1
- `conv-06` mais movimento -> **Warehouse Rumble** 1/1
- `conv-07` mais seco, menos reverb -> **Dub Ghost** 1/1
