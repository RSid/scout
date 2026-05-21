"""Category enumeration for frontend profile wiring."""

from __future__ import annotations

from fastapi import APIRouter

from scout.data.categories import frozen_category_manifest
from scout.data.schema import ApiCategory, CategoriesResponse

router = APIRouter(tags=["categories"])


@router.get("/categories")
async def list_categories() -> CategoriesResponse:
    rows = frozen_category_manifest()
    categories = [ApiCategory.model_validate(row) for row in rows]
    return CategoriesResponse(categories=categories)
