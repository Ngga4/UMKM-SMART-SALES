"""
UMKM AI Sales Analyzer - FastAPI Backend
Parses unstructured Indonesian sales text using Groq API (Llama model).
"""

import json
import os
import re
from contextlib import asynccontextmanager

from google import genai
from google.genai import types
from groq import Groq
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, SaleRecord, SaleItem, User
from auth import get_password_hash, verify_password, create_access_token, decode_access_token

load_dotenv()

# ---------------------------------------------------------------------------
# AI configuration
# ---------------------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY environment variable is not set. "
        "Create a .env file in the backend/ directory with: GROQ_API_KEY=your_key"
    )

client = Groq(api_key=GROQ_API_KEY)

MODEL_NAME = "llama-3.3-70b-versatile"

# if not GEMINI_API_KEY:
#     raise RuntimeError("GEMINI_API_KEY belum dipasang")

# client = genai.Client(api_key=GEMINI_API_KEY)


# ---------------------------------------------------------------------------
# Strict system prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """Kamu adalah asisten AI khusus untuk menganalisis data penjualan UMKM Indonesia.

TUGAS:
1. Parsing teks penjualan yang tidak terstruktur menjadi data terstruktur.
2. Memberikan saran bisnis yang ramah, suportif, dan praktis dalam bahasa Indonesia sehari-hari.

ATURAN KETAT:
- Output HARUS berupa JSON murni yang valid. TANPA markdown, TANPA code block, TANPA teks tambahan.
- Gunakan HANYA format berikut:

{
  "sales_data": [
    {"item": "Nama Barang", "quantity": <angka>, "unit": "<satuan>, "price": <angka_total_harga>"}
  ],
  "business_advice": "<saran bisnis singkat, ramah, dan suportif dalam bahasa Indonesia sehari-hari>"
}

PANDUAN PARSING:
- Kapitalisasi nama barang dengan benar (misal: "beras" -> "Beras", "kopi saset" -> "Kopi Saset").
- Konversi semua angka menjadi tipe number (bukan string).
- Jika satuan tidak disebutkan, tebak satuan yang paling masuk akal (misal: telur -> "butir", minyak -> "liter").
- Jika teks tidak mengandung data penjualan, kembalikan sales_data sebagai array kosong dan berikan saran umum.
- Ekstrak harga atau penjualan jika disebutkan. Jika tidak ada, isi dengan angka 0.

PANDUAN SARAN BISNIS:
- Berikan saran yang relevan berdasarkan barang yang terjual.
- Gunakan bahasa yang hangat dan mendukung, seperti berbicara dengan teman.
- Sertakan 1-2 tips praktis yang bisa langsung diterapkan.
"""

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[OK] UMKM AI Backend is running!")
    yield
    print("[BYE] Shutting down...")


app = FastAPI(
    title="UMKM AI Sales Analyzer",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow local React dev server
origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")

if origins_str == "*":
    allow_origins_list = ["*"]
else :
    allow_origins_list = [origin.strip() for origin in origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    text: str


class SalesItemModel(BaseModel):
    item: str
    quantity: float
    unit: str
    price: float = 0.0


class AnalyzeResponse(BaseModel):
    sales_data: list[SalesItemModel]
    business_advice: str


class HistoryAnalyzeRequest(BaseModel):
    period_label: str
    items: list[SalesItemModel]


class HistoryAnalyzeResponse(BaseModel):
    business_advice: str

# ---------------------------------------------------------------------------
# Auth Dependency & Endpoints
# ---------------------------------------------------------------------------
security = HTTPBearer(auto_error=False)

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials:
        payload = decode_access_token(credentials.credentials)
        if payload and "sub" in payload:
            return int(payload["sub"])
    return None

class RegisterRequest(BaseModel):
    store_name: str
    email: str
    password: str
    guest_id: str

@app.post("/api/auth/register")
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="Email sudah terdaftar.")
    
    new_user = User(
        store_name=request.store_name,
        email=request.email,
        hashed_password=get_password_hash(request.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Sync guest data
    if request.guest_id:
        db.query(SaleRecord).filter(SaleRecord.session_id == request.guest_id).update({"user_id": new_user.id})
        db.commit()
        
    token = create_access_token(data={"sub": str(new_user.id), "name": new_user.store_name})
    return {"access_token": token, "token_type": "bearer", "store_name": new_user.store_name}

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email atau password salah.")
    
    token = create_access_token(data={"sub": str(user.id), "name": user.store_name})
    return {"access_token": token, "token_type": "bearer", "store_name": user.store_name}

@app.get("/api/auth/me")
async def get_me(user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Sesi berakhir. Silakan login kembali.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan.")
    return {"store_name": user.store_name, "email": user.email}

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "message": "UMKM AI Sales Analyzer API"}


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_sales(
    request: AnalyzeRequest,
    db: Session = Depends(get_db),
    x_session_id: str = Header(default="default_guest", alias="X-Session-ID"),
    current_user_id: int = Depends(get_current_user_id)
):
    """Parse unstructured Indonesian sales text into structured data via Groq, and save to DB."""

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks penjualan tidak boleh kosong.")

    user_prompt = f'Analisis teks penjualan berikut:\n\n"{request.text.strip()}"'

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content.strip()
    # try:
    #     # Panggil Gemini dengan SDK Terbaru
    #     response = client.models.generate_content(
    #         model='gemini-2.0-flash',
    #         contents=f"{SYSTEM_PROMPT}\n\nAnalisis teks berikut:\n{request.text.strip()}",
    #         config=types.GenerateContentConfig(
    #             response_mime_type="application/json",
    #             temperature=0.3
    #         )
    #     )

    #     raw_text = response.text.strip()

        # Safety: strip markdown code fences if model adds them despite instructions
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)

        parsed = json.loads(raw_text)

        # Validate structure
        if "sales_data" not in parsed or "business_advice" not in parsed:
            raise ValueError("Response JSON missing required keys")

        # Save to Database
        db_record = SaleRecord(
            session_id=x_session_id,
            user_id=current_user_id,
            raw_text=request.text.strip(),
            business_advice=parsed["business_advice"]
        )
        db.add(db_record)
        db.commit()
        db.refresh(db_record)

        for item in parsed["sales_data"]:
            db_item = SaleItem(
                record_id=db_record.id,
                item=item.get("item"),
                quantity=item.get("quantity"),
                unit=item.get("unit"),
                price=item.get("price", 0.0)
            )
            db.add(db_item)
        
        db.commit()

        return AnalyzeResponse(
            sales_data=[SalesItemModel(**item) for item in parsed["sales_data"]],
            business_advice=parsed["business_advice"],
        )

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned invalid JSON: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}",
        )


@app.get("/api/history")
async def get_history(
    db: Session = Depends(get_db),
    x_session_id: str = Header(default="default_guest", alias="X-Session-ID"),
    current_user_id: int = Depends(get_current_user_id)
):
    """Retrieve all sales history from the database."""
    if current_user_id:
        records = db.query(SaleRecord).filter(SaleRecord.user_id == current_user_id).order_by(SaleRecord.date.desc()).all()
    else:
        records = db.query(SaleRecord).filter(SaleRecord.session_id == x_session_id).order_by(SaleRecord.date.desc()).all()
    history = []
    for r in records:
        history.append({
            "id": r.id,
            "date": r.date.isoformat() + "Z",
            "rawText": r.raw_text,
            "businessAdvice": r.business_advice,
            "salesData": [{"item": i.item, "quantity": i.quantity, "unit": i.unit, "price": i.price} for i in r.items]
        })
    return history


@app.delete("/api/history")
async def delete_history(
    db: Session = Depends(get_db),
    x_session_id: str = Header(default="default_guest", alias="X-Session-ID"),
    current_user_id: int = Depends(get_current_user_id)
):
    """Delete all sales history."""
    if current_user_id:
        records = db.query(SaleRecord).filter(SaleRecord.user_id == current_user_id).all()
    else:
        records = db.query(SaleRecord).filter(SaleRecord.session_id == x_session_id).all()
    
    for record in records:
        db.delete(record)

    db.commit()
    return {"status": "ok", "message": "History deleted successfully"}


@app.delete("/api/history/{record_id}")
async def delete_single_record(
    record_id: int,
    db: Session = Depends(get_db),
    x_session_id: str = Header(default="default_guest", alias="X-Session-ID"),
    current_user_id: int = Depends(get_current_user_id)
):
    """Delete a single sales record by ID."""
    if current_user_id:
        record = db.query(SaleRecord).filter(SaleRecord.id == record_id, SaleRecord.user_id == current_user_id).first()
    else:
        record = db.query(SaleRecord).filter(SaleRecord.id == record_id, SaleRecord.session_id == x_session_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"status": "ok", "message": f"Record {record_id} deleted"}


class UpdateItemModel(BaseModel):
    item: str
    quantity: float
    unit: str
    price: float = 0.0


class UpdateRecordRequest(BaseModel):
    items: list[UpdateItemModel]


@app.put("/api/history/{record_id}")
async def update_record(
    record_id: int,
    request: UpdateRecordRequest,
    db: Session = Depends(get_db),
    x_session_id: str = Header(default="default_guest", alias="X-Session-ID"),
    current_user_id: int = Depends(get_current_user_id)
):
    """Update items of a single sales record."""
    if current_user_id:
        record = db.query(SaleRecord).filter(SaleRecord.id == record_id, SaleRecord.user_id == current_user_id).first()
    else:
        record = db.query(SaleRecord).filter(SaleRecord.id == record_id, SaleRecord.session_id == x_session_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # Delete old items and replace with new ones
    db.query(SaleItem).filter(SaleItem.record_id == record_id).delete()
    for item_data in request.items:
        db_item = SaleItem(
            record_id=record_id,
            item=item_data.item,
            quantity=item_data.quantity,
            unit=item_data.unit,
            price=item_data.price
        )
        db.add(db_item)

    db.commit()
    db.refresh(record)
    return {"status": "ok", "message": f"Record {record_id} updated"}


@app.post("/api/analyze-history", response_model=HistoryAnalyzeResponse)
async def analyze_history(request: HistoryAnalyzeRequest):
    """Analyze aggregated historical sales data and provide strategic business advice."""
    
    if not request.items:
        raise HTTPException(status_code=400, detail="Data penjualan kosong.")

    items_text = "\n".join([f"- {item.item}: {item.quantity} {item.unit}" for item in request.items])
    
    system_prompt = (
        "Anda adalah konsultan bisnis UMKM ahli. Tugas Anda adalah memberikan saran strategis "
        "berdasarkan *akumulasi data penjualan* (bukan data harian tunggal). "
        "Fokus pada tren, manajemen stok jangka panjang, strategi bundling/promosi, dan efisiensi. "
        "Berikan jawaban dalam bahasa Indonesia yang profesional, ramah, dan aplikatif. "
        "Format jawaban harus murni JSON dengan format persis seperti ini: {\"business_advice\": \"<saran dalam format string>\"}."
    )
    
    user_prompt = f"Berikut adalah total penjualan untuk periode '{request.period_label}':\n\n{items_text}\n\nBerikan saran strategis."

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content.strip()

        # Safety: strip markdown code fences
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)

        parsed = json.loads(raw_text)

        if "business_advice" not in parsed:
            raise ValueError("Response JSON missing 'business_advice' key")

        advice_val = parsed["business_advice"]
        
        # If the model still returned a dict instead of a string, parse it into markdown
        if isinstance(advice_val, dict):
            formatted = []
            for k, v in advice_val.items():
                k_title = str(k).replace("_", " ").title()
                formatted.append(f"**{k_title}**\n{v}")
            advice_val = "\n\n".join(formatted)
        elif isinstance(advice_val, list):
            advice_val = "\n".join([f"- {str(x)}" for x in advice_val])
        else:
            advice_val = str(advice_val)

        return HistoryAnalyzeResponse(business_advice=advice_val)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")
