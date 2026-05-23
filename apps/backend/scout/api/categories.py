"""Category enumeration for frontend profile wiring."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from scout.data.categories import frozen_category_manifest
from scout.data.schema import ApiCategory, CategoriesResponse
from scout.security.rate_limit import POLICIES, limiter

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=CategoriesResponse)
@limiter.limit(POLICIES["categories_get"])
async def list_categories(request: Request) -> JSONResponse:
    del request
    rows = frozen_category_manifest()
    categories = [ApiCategory.model_validate(row) for row in rows]
    body = CategoriesResponse(categories=categories)
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))
