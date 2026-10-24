# Live South Indian Botanical Typography & Translation Engine

A real-time translation and transliteration layer integrated seamlessly into Type Garden, allowing users to type in English while dynamically generating organic botanical typography directly on native South Indian scripts (Tamil, Telugu, Kannada, Malayalam) in parallel.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following design and architectural choices were confirmed during Phase 1:

- **Canvas Rendering Mode**: Botanical flora (stems, blooming petals, spider lilies, wisteria, and climbing vines) will render **directly on the translated native script characters** rather than in a separate English-only view.
- **Language Scope**: Full support for all four major South Indian Dravidian languages: **Tamil (தமிழ்)**, **Telugu (తెలుగు)**, **Kannada (ಕನ್ನಡ)**, and **Malayalam (മലയാളം)**, plus an **English (Original)** bypass option.
- **Translation Engine Strategy**: Dual-mode engine featuring **Semantic Translation** (AI-powered conceptual translation via server-side Gemini 3.8 Flash) with a quick-switch toggle for **Phonetic Transliteration** (direct phonetic script mapping, e.g. "vanakkam" $\to$ "வணக்கம்") for instant zero-latency feedback.
- **Font & Glyph Rendering**: Dedicated Google Noto & Indic font stacks loaded dynamically to ensure ligatures, vowel signs, and complex conjuncts render with crisp typographical clarity under canvas rasterization.

---

### 1. Overview & Core Concept

- **What It Does**: As the user types in English on desktop or mobile, the application intercepts the input stream and computes a live parallel translation/transliteration into the selected South Indian language. The generative typography simulation engine then extracts glyph contours, calculates baseline metrics, and grows procedural vines, anime spider lilies, cascading wisteria, and butterflies directly on the translated native script.
- **Target Audience / Persona**: Typographers, bilingual and South Indian language speakers, digital artists, and creative writers seeking to craft botanical calligraphy in regional scripts.
- **Key Value**: Eliminates the need to install regional keyboards or copy-paste from external translation tools, providing a fluid, instantaneous, and culturally rich botanical art creation experience.

---

### 2. User Experience & Visual Design

#### A. Interactive Controls & Layout
- **Language Selector Bar**: A clean, single-line segmented tab strip positioned tastefully below the canvas header:
  `[ Original / EN ]  [ தமிழ் Tamil ]  [ తెలుగు Telugu ]  [ ಕನ್ನಡ Kannada ]  [ മലയാളം Malayalam ]`
  - Active language state indicated with a subtle high-contrast fill and crisp label (`whitespace-nowrap`).
- **Mode Switch Toggle**: An unobtrusive segmented pill-less toggle:
  `Mode: [ Semantic Translation ] | [ Phonetic Transliteration ]`
- **Parallel Translation Live Preview**: A sleek, dark glass floating preview bar at the bottom:
  - Left zone: English input stream as typed (e.g., `"The lotus blooms at dawn"`).
  - Center/Right zone: Live parallel translated string with real-time status indicator (`● TRANSLATED` or `TRANSCRIPTION ACTIVE`) and copy button.

#### B. Typographic & Native Script Engineering
- **Google Fonts Integration**:
  - Tamil: `Noto Sans Tamil` & `Mukta Malar`
  - Telugu: `Noto Sans Telugu` & `Mandali`
  - Kannada: `Noto Sans Kannada` & `Tiro Kannada`
  - Malayalam: `Noto Sans Malayalam` & `Gayathri`
- **Grapheme Cluster Segmentation**: Replaces naive character-by-character slicing with `Intl.Segmenter` (granularity: `grapheme`). This guarantees that dependent vowels (kombu, pulli, maatras) and conjunct consonants are treated as atomic botanical anchoring points without glyph corruption.

#### C. Color & Visual Aesthetics
- **Neutral Canvas**: Preserves the signature minimalist obsidian dark background (`#000000` / `#050507`) and refined hairline borders (`rgba(255,255,255,0.1)`).
- **Botanical Accents**: Deep crimson (Higanbana), Sakura blush (`#FFB4A8`), Golden marigold (`#EAB308`), and Wisteria lavender (`#BDB2FF`).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Hybrid Dual-Engine (Instant Phonetic + Debounced Semantic)**
  - *Chosen Approach*: Maintain an instant client-side rule-based transliterator for immediate glyph growth as keys are pressed, coupled with a 280ms debounced server-side Gemini API call for contextual semantic translation.
  - *Why*: Direct LLM translation on every keystroke introduces network jitter and latency; a hybrid approach gives the user instant visual response while automatically upgrading to high-quality semantic phrasing when the user pauses typing.
  - *Alternatives Considered*: Pure client dictionary (lacks natural semantic grammar); pure cloud API (sluggish keystroke response).

- **Decision 2: Grapheme-Aware Stem Growth**
  - *Chosen Approach*: Segment Indian scripts using `Intl.Segmenter` and measure conjunct widths with HTML5 Canvas `measureText`.
  - *Why*: South Indian scripts contain combining vowels (e.g. த + ி = தி). Slicing by string index breaks combining codepoints, leading to orphan circles or misplaced diacritic marks.

- **Decision 3: Server Architecture via Express Dev Proxy**
  - *Chosen Approach*: Introduce `server.ts` with Express and `@google/genai` mounted over Vite middlewares (`"dev": "tsx server.ts"`).
  - *Why*: Keeps the Gemini API key strictly secure on the server side in compliance with the platform instructions while enabling robust translation streaming.

---

### 4. Technical Architecture & Data Strategy

#### System & Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          User Input (English)                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
   [Phonetic Transliteration]                [Debounced Semantic API]
   (Client rule-based mapper)                (POST /api/translate)
   - Zero-latency Tamil/Telugu/              - Gemini 3.8 Flash
     Kannada/Malayalam phonetic               - Contextual semantic translation
               │                                         │
               └────────────────────┬────────────────────┘
                                    │ Active Script Output
                                    ▼
                 ┌──────────────────────────────────────┐
                 │  Grapheme Cluster Segmenter Engine   │
                 │      (Intl.Segmenter API)            │
                 └──────────────────┬───────────────────┘
                                    │
                                    ▼
                 ┌──────────────────────────────────────┐
                 │    Botanical Typography Canvas       │
                 │  - Letter Glyph Baseline Metrics     │
                 │  - Procedural Vine L-System Growth   │
                 │  - Species Blooming & Perching Flies │
                 └──────────────────────────────────────┘
```

#### State & API Specifications
- **Client State**:
  - `targetLang`: `'en' | 'ta' | 'te' | 'kn' | 'ml'`
  - `translationMode`: `'semantic' | 'phonetic'`
  - `englishInput`: Raw string from user typing.
  - `translatedText`: Current parallel string rendered on canvas.
  - `isTranslating`: Boolean indicating active server request.
- **Server Endpoint (`POST /api/translate`)**:
  - Body: `{ text: string, targetLang: 'ta' | 'te' | 'kn' | 'ml', sourceLang: 'en' }`
  - Response: `{ translatedText: string, detectedSource: string }`
  - Model: `gemini-3.8-flash` with structured system instructions optimized for natural Dravidian regional phrasing.

#### Verification & Test Plan
1. **Script Rendering Verification**: Verify Tamil, Telugu, Kannada, and Malayalam render accurately with proper font ligature shaping without broken vowel signs.
2. **Keystroke Performance**: Test typing speed at >60 WPM to ensure smooth 60fps canvas animation, no layout stutter, and correct debounce handling.
3. **Language Switching**: Switch between languages on an existing typed phrase to confirm vines and petals re-grow naturally around the new script contours.
4. **Build & Lint Verification**: Run `compile_applet` and verify server and client build without errors.
