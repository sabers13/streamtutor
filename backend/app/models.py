from typing import List, Optional
from pydantic import BaseModel, Field


class ImportantWord(BaseModel):
    word: str
    meaning: str


class AnalyzeSentenceRequest(BaseModel):
    text: str = Field(..., description="Active German subtitle sentence")
    previous: Optional[str] = Field(None, description="Optional preceding subtitle context")
    next: Optional[str] = Field(None, description="Optional subsequent subtitle context")
    user_level: str = Field("A2", description="User's current CEFR level (default: A2)")
    threshold: Optional[str] = Field(None, description="Minimum level to show help (default: B1)")
    ai_enabled: Optional[bool] = Field(True, description="Whether to use live AI (Gemini) or offline deterministic analyzer")


class AnalyzeSentenceResponse(BaseModel):
    text: str
    estimated_level: str = Field(..., description="Estimated CEFR difficulty: A1, A2, B1, B2, C1, C2")
    show_help: bool = Field(..., description="True if estimated_level meets or exceeds threshold")
    translation: str = Field(..., description="Natural English translation")
    note: str = Field(..., description="Short grammatical or lexical explanation")
    important_words: List[ImportantWord] = Field(default_factory=list)


class SubtitleCueItem(BaseModel):
    text: str
    start: Optional[int] = Field(None, description="Start time in milliseconds")
    end: Optional[int] = Field(None, description="End time in milliseconds")
    track: Optional[int] = Field(None, description="Track number")


class AnalyzeEpisodeRequest(BaseModel):
    cues: List[SubtitleCueItem] = Field(..., description="List of all subtitle cues in the episode")
    user_level: str = Field("A2", description="User's current CEFR level")
    threshold: Optional[str] = Field(None, description="Minimum level to show help")


class AnalyzeEpisodeResponse(BaseModel):
    results: List[AnalyzeSentenceResponse]
    total: int
    b1_plus_count: int


class ExplainSentenceRequest(BaseModel):
    text: str = Field(..., description="German subtitle sentence to explain")
    previous: Optional[str] = Field(None, description="Preceding subtitle context")
    next: Optional[str] = Field(None, description="Subsequent subtitle context")
    user_level: str = Field("A2", description="Learner CEFR level (default: A2)")


class ExplainSentenceResponse(BaseModel):
    text: str
    explanation: str


class LookupWordResponse(BaseModel):
    word: str
    meaning: str
    base_form: Optional[str] = None
    grammar: Optional[str] = None


class SaveFlashcardRequest(BaseModel):
    front: str = Field(..., description="German target word or full sentence")
    back: str = Field(..., description="English definition or translation")
    card_type: str = Field("word", description="'word' or 'sentence'")
    example_sentence: Optional[str] = Field(None, description="German dialogue sentence context")
    sentence_translation: Optional[str] = Field(None, description="English translation of the dialogue sentence")
    grammar_note: Optional[str] = Field(None, description="Grammar note or part of speech")
    cefr_level: Optional[str] = Field(None, description="CEFR level (A1-C2)")
    source: Optional[str] = Field("StreamTutor / Video", description="Media source")


class SaveFlashcardResponse(BaseModel):
    success: bool
    total_saved: int
    message: str
