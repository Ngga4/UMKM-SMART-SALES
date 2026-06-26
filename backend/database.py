from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:@localhost/umkm_ai")

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    store_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    records = relationship("SaleRecord", back_populates="user", cascade="all, delete-orphan")

class SaleRecord(Base):
    __tablename__ = "sale_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), index=True, default="default_guest", nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    raw_text = Column(Text, nullable=False)
    business_advice = Column(Text, nullable=True)

    items = relationship("SaleItem", back_populates="record", cascade="all, delete-orphan")
    user = relationship("User", back_populates="records")

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("sale_records.id"))
    item = Column(String(255), nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String(50), nullable=True)
    price = Column(Float, nullable=True)

    record = relationship("SaleRecord", back_populates="items")

# Create tables
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
