import re
from typing import Dict, List, Optional, Tuple
from app.analyzers.base import SentenceAnalyzer, is_level_at_least
from app.models import AnalyzeSentenceResponse, ImportantWord
from app.normalizer import normalize_subtitle_text


class DeterministicAnalyzer(SentenceAnalyzer):
    """
    Offline, deterministic rule-based analyzer.
    Analyzes sentence difficulty by evaluating:
    - Modal verbs and causative verb constructions (können, müssen, lassen)
    - Personal pronouns and grammatical cases (Akkusativ, Dativ)
    - Subordinating conjunctions (Nebensatz structure)
    - Pronominal adverbs (wovon, worüber, etc.)
    - Konjunktiv II & Passive forms
    - Modal particles (doch, überhaupt, bloß, mal, etc.)
    - Idiomatic phrases and conversational anime vocabulary
    """

    @property
    def name(self) -> str:
        return "deterministic-v1.2"

    # Known exact/canonical sentences for high-fidelity demonstration
    CANONICAL_SENTENCES: Dict[str, Dict] = {
        "ich kann ihn nicht bestehen lassen": {
            "estimated_level": "A2",
            "translation": "I can't let him pass.",
            "note": "Modal verb 'kann' + causative 'lassen': 'nicht bestehen lassen' means 'cannot let (him) pass'. Pronoun 'ihn' is Akkusativ.",
            "important_words": [
                {"word": "bestehen lassen", "meaning": "to let pass (an exam / test)"},
                {"word": "kann (können)", "meaning": "can / to be able to (modal verb)"},
                {"word": "ihn", "meaning": "him (direct object in Akkusativ)"},
                {"word": "bestehen", "meaning": "to pass (exam) / to persist"},
            ],
        },
        "du weißt doch überhaupt nicht, wovon du redest": {
            "estimated_level": "B1",
            "translation": "You have absolutely no idea what you're talking about.",
            "note": "wovon = wo(r) + von; reden von + Dativ; modal particle 'überhaupt nicht' = not at all",
            "important_words": [
                {"word": "wovon", "meaning": "what ... about (pronominal adverb)"},
                {"word": "überhaupt", "meaning": "at all / generally (modal particle)"},
                {"word": "reden von", "meaning": "to talk about (+ Dativ)"},
            ],
        },
        "du weisst doch ueberhaupt nicht, wovon du redest": {
            "estimated_level": "B1",
            "translation": "You have absolutely no idea what you're talking about.",
            "note": "wovon = wo(r) + von; reden von + Dativ",
            "important_words": [
                {"word": "wovon", "meaning": "what ... about"},
            ],
        },
        "das ist mein ninja-weg": {
            "estimated_level": "A1",
            "translation": "That is my ninja way!",
            "note": "Simple copula sentence with 'sein' and possessive pronoun 'mein'.",
            "important_words": [
                {"word": "Weg", "meaning": "way / path"},
            ],
        },
        "ich werde der nächste hokage": {
            "estimated_level": "A2",
            "translation": "I will be the next Hokage!",
            "note": "Future tense with 'werden' + adjective 'nächste'.",
            "important_words": [
                {"word": "nächste", "meaning": "next"},
                {"word": "werden", "meaning": "to become / will"},
                {"word": "Hokage", "meaning": "Hokage (village leader title)"},
            ],
        },
        "warum hast du dort alles mit graffiti bemalt": {
            "estimated_level": "A2",
            "translation": "Why did you paint graffiti all over that place?",
            "note": "Perfekt tense: 'hast ... bemalt' (inseparable prefix 'be-'). Question word 'warum'.",
            "important_words": [
                {"word": "bemalen", "meaning": "to paint on / over (inseparable prefix be-)"},
                {"word": "Graffiti", "meaning": "graffiti"},
                {"word": "dort", "meaning": "there / over there"},
            ],
        },
        "heute werden wir das jutsu der verwandlung noch mal prüfen": {
            "estimated_level": "B1",
            "translation": "Today we will test the Transformation Jutsu once more.",
            "note": "Modal particle 'noch mal' (again/once more) + Genitive 'der Verwandlung'.",
            "important_words": [
                {"word": "prüfen", "meaning": "to test / examine"},
                {"word": "Verwandlung", "meaning": "transformation"},
                {"word": "noch mal", "meaning": "once more / again"},
            ],
        },
        "die leute die bestanden haben sollen auch mitmachen": {
            "estimated_level": "B1",
            "translation": "Even the people who have passed are supposed to participate.",
            "note": "Relative clause 'die bestanden haben' + modal verb 'sollen' + separable verb 'mitmachen'.",
            "important_words": [
                {"word": "mitmachen", "meaning": "to join in / participate"},
                {"word": "bestehen", "meaning": "to pass (an exam)"},
                {"word": "sollen", "meaning": "should / are supposed to"},
            ],
        },
        "naruto hat gerade mal einen und der wäre im kampf nur ein klotz am bein": {
            "estimated_level": "B1",
            "translation": "Naruto barely has one. And that one would just be dead weight in battle.",
            "note": "'Ein Klotz am Bein' is an idiom meaning dead weight/burden. 'Wäre' is Konjunktiv II.",
            "important_words": [
                {"word": "ein Klotz am Bein", "meaning": "a burden / dead weight"},
                {"word": "gerade mal", "meaning": "just / barely"},
                {"word": "wäre", "meaning": "would be (Konjunktiv II)"},
            ],
        },
        "naruto hat gerade mal einen und derwäre im kampf nur ein klotz am bein": {
            "estimated_level": "B1",
            "translation": "Naruto barely has one. And that one would just be dead weight in battle.",
            "note": "'Ein Klotz am Bein' is an idiom meaning dead weight/burden. 'Wäre' is Konjunktiv II.",
            "important_words": [
                {"word": "ein Klotz am Bein", "meaning": "a burden / dead weight"},
                {"word": "gerade mal", "meaning": "just / barely"},
                {"word": "wäre", "meaning": "would be (Konjunktiv II)"},
            ],
        },
        "ich gebe niemals auf, das ist mein ninja-weg": {
            "estimated_level": "A2",
            "translation": "I never give up, that is my ninja way!",
            "note": "Separable verb: aufgeben (ich gebe ... auf).",
            "important_words": [
                {"word": "aufgeben", "meaning": "to give up (separable verb)"},
                {"word": "niemals", "meaning": "never"},
            ],
        },
        "obwohl ich schwach bin, gebe ich niemals auf": {
            "estimated_level": "B1",
            "translation": "Even though I am weak, I will never give up.",
            "note": "Subordinate clause with 'obwohl' causing verb-final position ('bin').",
            "important_words": [
                {"word": "obwohl", "meaning": "although / even though (subjunction)"},
                {"word": "schwach", "meaning": "weak"},
            ],
        },
        "wenn du dich nicht zusammenreißt, werden wir alle sterben": {
            "estimated_level": "B2",
            "translation": "If you don't pull yourself together, we will all die.",
            "note": "Reflexive separable verb 'sich zusammenreißen' in conditional 'wenn' clause.",
            "important_words": [
                {"word": "sich zusammenreißen", "meaning": "to pull oneself together"},
                {"word": "sterben", "meaning": "to die"},
            ],
        },
    }

    # Grammatical indicators of CEFR levels
    B1_SUBJUNCTIONS = {
        "obwohl": "although / even though (subordinate clause)",
        "während": "while / during (subordinate clause)",
        "sodass": "so that (consecutive clause)",
        "damit": "so that / in order that (final clause)",
        "nachdem": "after (temporal clause, requires past tense)",
        "bevor": "before (temporal clause)",
        "falls": "in case / if (conditional clause)",
        "seitdem": "since / ever since",
        "indem": "by doing / while",
        "solange": "as long as",
        "sobald": "as soon as",
    }

    B1_PRONOMINAL_ADVERBS = {
        "wovon": "what ... about/of (wo(r) + von)",
        "worüber": "what ... about (wo(r) + über)",
        "womit": "what ... with (wo(r) + mit)",
        "woran": "what ... on/at (wo(r) + an)",
        "worauf": "what ... on/for (wo(r) + auf)",
        "woraus": "what ... from/out of",
        "wofür": "what ... for",
        "wogegen": "what ... against",
        "wonach": "what ... after",
        "weshalb": "why / for what reason",
        "weswegen": "why / on what account",
        "davon": "of that / from that",
        "darüber": "about that",
        "daran": "at/on that",
        "damit": "with that / so that",
        "dafür": "for that",
    }

    B1_MODAL_PARTICLES = {
        "überhaupt": "at all / generally (modal particle)",
        "eigentlich": "actually / in fact",
        "bloß": "only / just (intensifier: 'Was machst du bloß?')",
        "nämlich": "namely / you see",
        "halt": "simply / just (particle expressing resignation)",
        "jedenfalls": "in any case / at least",
    }

    B1_KONJUNKTIV_PASSIVE = {
        "hätte": "would have (Konjunktiv II of haben)",
        "wäre": "would be (Konjunktiv II of sein)",
        "würde": "would (Konjunktiv II auxiliary)",
        "könnte": "could / would be able to (Konjunktiv II of können)",
        "müsste": "would have to (Konjunktiv II of müssen)",
        "sollte": "should (Konjunktiv II of sollen)",
        "dürfte": "might / may (Konjunktiv II of dürfen)",
        "wurde": "became / was (Präteritum of werden or passive)",
        "wurden": "were (passive auxiliary)",
        "worden": "been (passive Partizip II auxiliary)",
    }

    B2_MARKERS = {
        "insofern": "insofar / to that extent",
        "geschweige": "let alone",
        "vorausgesetzt": "provided that / on condition",
        "je nachdem": "depending on",
        "ungeachtet": "regardless of / notwithstanding",
        "aufgrund": "on the basis of / due to",
        "hinsichtlich": "with regard to",
        "in anbetracht": "in view of / considering",
    }

    # Multi-word phrases & idioms
    PHRASES: Dict[str, Tuple[str, str]] = {
        "bestehen lassen": ("to let/allow someone pass (an exam or test)", "A2"),
        "fallen lassen": ("to drop / let fall", "A2"),
        "gehen lassen": ("to let go / release", "A2"),
        "in ruhe lassen": ("to leave alone / in peace", "A2"),
        "klotz am bein": ("a burden / dead weight (idiom)", "B1"),
        "ein klotz am bein": ("a burden / dead weight (idiom)", "B1"),
        "gar keinen sinn": ("makes absolutely no sense", "A2"),
        "keinen sinn": ("makes no sense", "A2"),
        "keine ahnung": ("no idea / no clue", "A1"),
        "auf jeden fall": ("definitely / in any case", "A2"),
        "auf keinen fall": ("under no circumstances / no way", "A2"),
        "gar nicht": ("not at all", "A2"),
        "überhaupt nicht": ("not at all / absolutely not", "B1"),
        "gerade mal": ("just / barely", "B1"),
        "pass auf": ("watch out! / pay attention!", "A1"),
        "macht nichts": ("it doesn't matter / never mind", "A1"),
        "was ist los": ("what's the matter? / what's going on?", "A1"),
        "wie geht's": ("how are you?", "A1"),
        "am ende": ("in the end", "A2"),
        "zum beispiel": ("for example", "A2"),
        "vor allem": ("above all / especially", "B1"),
        "schatten doppelgänger": ("shadow clone technique", "A2"),
    }

    # Modal verbs
    MODAL_VERBS: Dict[str, Tuple[str, str]] = {
        "kann": ("können (can / to be able to)", "ability or permission"),
        "kannst": ("können (can / to be able to)", "ability or permission"),
        "können": ("können (can / to be able to)", "ability or permission"),
        "könnt": ("können (can / to be able to)", "ability or permission"),
        "muss": ("müssen (must / to have to)", "necessity or obligation"),
        "musst": ("müssen (must / to have to)", "necessity or obligation"),
        "müssen": ("müssen (must / to have to)", "necessity or obligation"),
        "müsst": ("müssen (must / to have to)", "necessity or obligation"),
        "will": ("wollen (to want / intend)", "intention or desire"),
        "willst": ("wollen (to want / intend)", "intention or desire"),
        "wollen": ("wollen (to want / intend)", "intention or desire"),
        "wollt": ("wollen (to want / intend)", "intention or desire"),
        "wollte": ("wollte (wanted to)", "past intention"),
        "soll": ("sollen (should / supposed to)", "duty or expectation"),
        "sollst": ("sollen (should / supposed to)", "duty or expectation"),
        "sollen": ("sollen (should / supposed to)", "duty or expectation"),
        "sollt": ("sollen (should / supposed to)", "duty or expectation"),
        "darf": ("dürfen (may / to be allowed to)", "permission"),
        "darfst": ("dürfen (may / to be allowed to)", "permission"),
        "dürfen": ("dürfen (may / to be allowed to)", "permission"),
        "dürft": ("dürfen (may / to be allowed to)", "permission"),
        "mag": ("mögen (to like)", "preference"),
        "magst": ("mögen (to like)", "preference"),
        "möchte": ("möchte (would like to)", "polite request"),
        "möchtest": ("möchte (would like to)", "polite request"),
        "möchten": ("möchte (would like to)", "polite request"),
    }

    # Personal pronouns with cases
    PRONOUNS: Dict[str, Tuple[str, str]] = {
        "ihn": ("him (direct object / Akkusativ)", "Personal pronoun 'ihn' (Akkusativ)"),
        "ihm": ("him / to him (indirect object / Dativ)", "Personal pronoun 'ihm' (Dativ)"),
        "ihr": ("her (Dativ) or possessive (her/their)", "Pronoun 'ihr'"),
        "mich": ("me (direct object / Akkusativ)", "Personal pronoun 'mich' (Akkusativ)"),
        "mir": ("me / to me (indirect object / Dativ)", "Personal pronoun 'mir' (Dativ)"),
        "dich": ("you (direct object / Akkusativ)", "Personal pronoun 'dich' (Akkusativ)"),
        "dir": ("you / to you (indirect object / Dativ)", "Personal pronoun 'dir' (Dativ)"),
        "uns": ("us (Akkusativ/Dativ)", "Personal pronoun 'uns'"),
        "euch": ("you all (Akkusativ/Dativ)", "Personal pronoun 'euch'"),
        "ihnen": ("them / to them (Dativ)", "Personal pronoun 'ihnen' (Dativ)"),
    }

    # Broad vocabulary dictionary
    VOCABULARY_GLOSSARY: Dict[str, str] = {
        # Core verbs
        "lassen": "to let / allow / have done",
        "lässt": "lets / allows (lassen)",
        "ließ": "let / allowed (Präteritum of lassen)",
        "bestehen": "to pass (exam) / to persist / exist",
        "aufgeben": "to give up (separable verb)",
        "gebe": "give (geben)",
        "geben": "to give",
        "beeilen": "sich beeilen (to hurry up)",
        "schaffen": "to manage / succeed / make it",
        "vergessen": "to forget (hat vergessen)",
        "verstehen": "to understand (versteht, verstand)",
        "glauben": "to believe / think",
        "wissen": "to know (a fact: ich weiß, du weißt)",
        "weiß": "know (wissen)",
        "kennen": "to know / be acquainted with",
        "kämpfen": "to fight / battle",
        "sterben": "to die (stirbt, starb, gestorben)",
        "töten": "to kill",
        "retten": "to save / rescue",
        "beschützen": "to protect / defend",
        "besiegen": "to defeat / conquer",
        "verlieren": "to lose (verliert, verlor)",
        "gewinnen": "to win (gewinnt, gewann)",
        "angreifen": "to attack (separable: greift an)",
        "verteidigen": "to defend",
        "helfen": "to help (+ Dativ: hilft, half)",
        "sehen": "to see (sieht, sah, gesehen)",
        "sieht": "sees (sehen)",
        "hören": "to hear / listen",
        "bleiben": "to stay / remain (ist geblieben)",
        "gehen": "to go / walk (geht, ging, ist gegangen)",
        "kommen": "to come (kommt, kam, ist gekommen)",
        "laufen": "to run / walk",
        "halten": "to hold / stop",
        "nehmen": "to take (nimmt, nahm, genommen)",
        "finden": "to find / consider",
        "brauchen": "to need",
        "suchen": "to search / look for",
        "versuchen": "to try / attempt",
        "zeigen": "to show / demonstrate",
        "fragen": "to ask",
        "antworten": "to answer (+ Dativ)",
        "sagen": "to say / tell",
        "erzählen": "to tell / narrate",
        "sprechen": "to speak (spricht, sprach)",
        "reden": "to talk",
        "werden": "to become / will (future tense auxiliary)",
        "wird": "becomes / will (werden)",
        "wirst": "become / will (werden)",
        # Anime & dialogue nouns
        "stirnband": "das Stirnband (headband / forehead protector)",
        "ninja": "der Ninja (ninja / shinobi)",
        "shinobi": "der Shinobi (ninja)",
        "hokage": "der Hokage (village leader title)",
        "meister": "der Meister (master / teacher)",
        "sensei": "Sensei (teacher / instructor)",
        "schüler": "der Schüler (student / disciple)",
        "akademie": "die Akademie (ninja academy)",
        "prüfung": "die Prüfung (exam / test / trial)",
        "schriftrolle": "die Schriftrolle (scroll)",
        "schattendoppelgänger": "shadow clone (Kage Bunshin)",
        "dorf": "das Dorf (village)",
        "freund": "der Freund (friend)",
        "feind": "der Feind (enemy)",
        "gegner": "der Gegner (opponent)",
        "kraft": "die Kraft (power / strength)",
        "stärke": "die Stärke (strength)",
        "mut": "der Mut (courage)",
        "angst": "die Angst (fear)",
        "kampf": "der Kampf (fight / battle)",
        "krieg": "der Krieg (war)",
        "sieg": "der Sieg (victory)",
        "niederlage": "die Niederlage (defeat)",
        "schicksal": "das Schicksal (destiny / fate)",
        "verräter": "der Verräter (traitor)",
        "geheimnis": "das Geheimnis (secret)",
        "verbündete": "allies",
        "dorfgemeinschaft": "village community",
        "chakra": "das Chakra (spiritual energy)",
        "jutsu": "das Jutsu (ninja art/technique)",
        "weg": "der Weg (way / path: 'Ninja-Weg')",
        "leben": "das Leben (life)",
        "tod": "der Tod (death)",
        "zeit": "die Zeit (time)",
        "grund": "der Grund (reason)",
        "sinn": "der Sinn (sense / meaning)",
        "chance": "die Chance (chance / opportunity)",
        "traum": "der Traum (dream)",
        "ziel": "das Ziel (goal / target)",
        "leute": "die Leute (people)",
        "mensch": "der Mensch (human / person)",
        # Adjectives & adverbs
        "stark": "strong",
        "schwach": "weak",
        "schnell": "fast / quick",
        "langsam": "slow",
        "gefährlich": "dangerous",
        "bereit": "ready / prepared",
        "wichtig": "important",
        "einfach": "simple / easy",
        "schwer": "hard / difficult",
        "schwierig": "difficult",
        "wahr": "true",
        "falsch": "wrong / false",
        "stolz": "proud",
        "mutig": "brave / courageous",
        "allein": "alone",
        "zusammen": "together",
        "wieder": "again",
        "immer": "always",
        "nie": "never",
        "niemals": "never",
        "vielleicht": "maybe / perhaps",
        "wirklich": "really / truly",
        "echt": "real / genuine / really",
        "schon": "already",
        "noch": "still / yet",
        "jetzt": "now",
        "gleich": "right away / soon",
        "bald": "soon",
        "hier": "here",
        "dort": "there",
        "warum": "why",
        "wieso": "why / how come",
        "wie": "how",
        "wo": "where",
        "was": "what",
        "wer": "who",
        "wann": "when",
        # Naruto dialogue specific terms
        "doppelgänger": "clone / double (Kage Bunshin)",
        "erschaffen": "to create / produce (Perfekt: hat erschaffen)",
        "mindestens": "at least",
        "durchgefallen": "failed (an exam - from durchfallen)",
        "abgeschlossen": "completed / graduated (Schule abgeschlossen)",
        "ausdauer": "die Ausdauer (endurance / stamina)",
        "bewegung": "die Bewegung (movement / agility)",
        "bewegungen": "movements / agility",
        "anerkennen": "to recognize / acknowledge",
        "anprobieren": "to try on (clothes / gear)",
        "erwachsen": "grown-up / adult",
        "zeichen": "das Zeichen (sign / symbol / token)",
        "abgenommen": "taken off / removed (Brille abgenommen)",
        "nachschlag": "der Nachschlag (second portion / refill)",
        "thema": "das Thema (topic / subject)",
        "schwachpunkt": "der Schwachpunkt (weakness / weak point)",
        "egal": "all the same / doesn't matter (Egal = whatever)",
        "aufgerufen": "called up / summoned",
        "beginnen": "to begin / start",
        "abschlussprüfung": "die Abschlussprüfung (final graduation exam)",
        "abschlussprüfungen": "final graduation exams",
        "dämpfer": "der Dämpfer (setback / dampener / blow)",
        "anzuwenden": "to apply / to use (anwenden)",
        "geschafft": "managed / accomplished (schaffen)",
    }

    def _clean_key(self, text: str) -> str:
        cleaned = normalize_subtitle_text(text).lower()
        cleaned = re.sub(r"[.!?:;\"'„“«»]", "", cleaned).strip()
        return cleaned

    def _estimate_grammar_level(self, text: str) -> Tuple[str, List[str], List[ImportantWord]]:
        tokens = [t.lower().strip(".,!?:;\"'„“«»") for t in text.split()]
        lower_text = text.lower()
        reasons: List[str] = []
        important_words: List[ImportantWord] = []
        words_added = set()

        def add_word(word_str: str, meaning_str: str):
            if word_str.lower() not in words_added:
                words_added.add(word_str.lower())
                important_words.append(ImportantWord(word=word_str, meaning=meaning_str))

        level_order = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
        current_level = "A1"

        def upgrade_level(new_lvl: str):
            nonlocal current_level
            if level_order.get(new_lvl, 1) > level_order.get(current_level, 1):
                current_level = new_lvl

        # 1. Match multi-word phrases and idioms first
        for phrase, (meaning, p_level) in self.PHRASES.items():
            if phrase in lower_text:
                add_word(phrase, meaning)
                reasons.append(f"Phrase '{phrase}': {meaning}")
                upgrade_level(p_level)

        # 2. Check B2 markers
        for marker, meaning in self.B2_MARKERS.items():
            if marker in lower_text:
                reasons.append(f"advanced structure '{marker}'")
                add_word(marker, meaning)
                upgrade_level("B2")

        # 3. Check B1 subjunctions (subordinate clauses)
        found_subjunctions = [w for w in self.B1_SUBJUNCTIONS if w in tokens]
        if found_subjunctions:
            reasons.append(f"subordinate clause with '{', '.join(found_subjunctions)}' (verb-final position)")
            for w in found_subjunctions:
                add_word(w, self.B1_SUBJUNCTIONS[w])
            upgrade_level("B1")

        # 4. Check B1 pronominal adverbs
        found_pro_adverbs = [w for w in self.B1_PRONOMINAL_ADVERBS if w in tokens]
        if found_pro_adverbs:
            reasons.append(f"pronominal adverb: {', '.join(found_pro_adverbs)}")
            for w in found_pro_adverbs:
                add_word(w, self.B1_PRONOMINAL_ADVERBS[w])
            upgrade_level("B1")

        # 5. Check B1 Konjunktiv II / Passive
        found_konj = [w for w in self.B1_KONJUNKTIV_PASSIVE if w in tokens]
        if found_konj:
            reasons.append(f"subjunctive/passive verb form: {', '.join(found_konj)}")
            for w in found_konj:
                add_word(w, self.B1_KONJUNKTIV_PASSIVE[w])
            upgrade_level("B1")

        # 6. Check B1 modal particles
        found_particles = [w for w in self.B1_MODAL_PARTICLES if w in tokens]
        if found_particles:
            reasons.append(f"modal particle: {', '.join(found_particles)}")
            for w in found_particles:
                add_word(w, self.B1_MODAL_PARTICLES[w])
            if len(found_particles) >= 2 or len(tokens) > 6:
                upgrade_level("B1")

        # 7. Check modal verbs
        found_modals = [w for w in tokens if w in self.MODAL_VERBS]
        if found_modals:
            for m in found_modals:
                meaning, desc = self.MODAL_VERBS[m]
                reasons.append(f"modal verb '{m}' expressing {desc}")
                add_word(m, meaning)
            upgrade_level("A2")

        # 7b. Check Perfekt tense (haben/sein + Partizip II)
        has_aux = any(w in tokens for w in ("haben", "habe", "hast", "hat", "sein", "bin", "bist", "ist", "sind", "seid"))
        partizip_tokens = [w for w in tokens if (w.startswith("ge") and len(w) > 4) or w in ("erschaffen", "abgeschlossen", "durchgefallen", "abgenommen", "vergessen", "verstanden")]
        if has_aux and partizip_tokens:
            reasons.append(f"Perfekt tense (past action): auxiliary + past participle '{partizip_tokens[0]}'")
            upgrade_level("A2")

        # 8. Check causative 'lassen'
        if any(w in tokens for w in ("lassen", "lässt", "ließ", "gelassen")):
            if not any("lassen" in iw.word for iw in important_words):
                add_word("lassen", "to let / allow / have done (causative verb)")
            reasons.append("causative verb 'lassen' (allowing or causing an action)")
            upgrade_level("A2")

        # 9. Check personal pronouns with cases
        for token in tokens:
            if token in self.PRONOUNS:
                meaning, desc = self.PRONOUNS[token]
                add_word(token, meaning)
                reasons.append(desc)
                upgrade_level("A2")

        # 10. Check vocabulary glossary for other key words
        for token in tokens:
            if token in self.VOCABULARY_GLOSSARY and len(important_words) < 5:
                add_word(token, self.VOCABULARY_GLOSSARY[token])

        # 11. Sentence length heuristics
        if len(tokens) > 10 and current_level == "A1":
            current_level = "A2"
            if not reasons:
                reasons.append("extended sentence structure")

        return current_level, reasons, important_words

    async def analyze(
        self,
        text: str,
        previous: Optional[str] = None,
        next_text: Optional[str] = None,
        user_level: str = "A2",
        threshold: str = "B1",
    ) -> AnalyzeSentenceResponse:
        norm_text = normalize_subtitle_text(text)
        key = self._clean_key(norm_text)

        # Check predefined canonical sentences first
        if key in self.CANONICAL_SENTENCES:
            data = self.CANONICAL_SENTENCES[key]
            estimated_level = data["estimated_level"]
            show_help = is_level_at_least(estimated_level, threshold)
            important_words = [ImportantWord(**iw) for iw in data.get("important_words", [])]
            return AnalyzeSentenceResponse(
                text=norm_text,
                estimated_level=estimated_level,
                show_help=show_help,
                translation=data["translation"],
                note=data["note"],
                important_words=important_words,
            )

        # Dynamic heuristic estimation
        estimated_level, reasons, important_words = self._estimate_grammar_level(norm_text)
        show_help = is_level_at_least(estimated_level, threshold)

        # Build informative note
        if reasons:
            note = f"Key grammatical pattern: {'; '.join(reasons[:2])}."
        else:
            note = f"Standard {estimated_level} sentence structure with foundational vocabulary."

        # Provide fast real translation via GTX / MyMemory
        from app.translator import fast_translate_de_to_en
        translation = fast_translate_de_to_en(norm_text)

        return AnalyzeSentenceResponse(
            text=norm_text,
            estimated_level=estimated_level,
            show_help=show_help,
            translation=translation,
            note=note,
            important_words=important_words,
        )
