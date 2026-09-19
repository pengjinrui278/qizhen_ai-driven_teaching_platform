"""Review-gated source units; textbook locations must never be inferred at answer time."""
from typing import Literal
from pydantic import BaseModel, Field, model_validator

class SourceSpan(BaseModel):
    pdf_page: int = Field(ge=1)
    printed_page: str | None = None
    # Normalized rectangle; optional until layout detection has been reviewed.
    bbox: tuple[float,float,float,float] | None = None

    @model_validator(mode="after")
    def valid_box(self):
        if self.bbox:
            x0,y0,x1,y1=self.bbox
            if not (0<=x0<x1<=1 and 0<=y0<y1<=1):
                raise ValueError("Invalid page rectangle")
        return self

class TextbookUnit(BaseModel):
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    book_title: str = Field(min_length=1)
    edition: str = Field(min_length=1)
    volume: str = Field(min_length=1)
    chapter: str | None = None
    section: str | None = None
    kind: Literal["definition","theorem","explanation","proof","example","exercise","other"]
    number: str | None = None
    source_spans: list[SourceSpan] = Field(min_length=1)
    original_text: str = Field(min_length=1)
    explanation: str | None = None
    knowledge_links: list[str] = Field(default_factory=list)
    unresolved: list[str] = Field(default_factory=list)
    status: Literal["draft","needs_review","verified"] = "draft"
    formula_checked: bool = False
    location_checked: bool = False
    completeness_checked: bool = False
    reviewer: str | None = None
    reviewed_at: str | None = None

    @model_validator(mode="after")
    def publication_gate(self):
        pages=[span.pdf_page for span in self.source_spans]
        if pages!=sorted(set(pages)):
            raise ValueError("Page spans must be unique and ordered")
        if self.status=="verified":
            if not all([self.formula_checked,self.location_checked,self.completeness_checked,self.reviewer,self.reviewed_at]):
                raise ValueError("Verification requires explicit checks and audit identity")
            if self.unresolved:
                raise ValueError("Unresolved units cannot be verified")
            if not self.chapter or not self.section or any(s.printed_page is None for s in self.source_spans):
                raise ValueError("Verified units require complete source locations")
            if self.kind in ("example","exercise") and not self.number:
                raise ValueError("Verified exercises require original numbering")
        return self

    def citation(self):
        if self.status!="verified":
            raise ValueError("Unverified text cannot be cited as verified textbook evidence")
        pages="、".join(dict.fromkeys(s.printed_page for s in self.source_spans))
        number=f" 第{self.number}题" if self.kind in ("example","exercise") else (f" {self.number}" if self.number else "")
        return f"{self.book_title}（{self.edition}，{self.volume}）{self.chapter} {self.section}{number}，第{pages}页"
