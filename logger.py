"""
=============================================================
  ONCF Z2M — Système de Supervision VFD
  Fichier  : logger.py
  Version  : 12.0 (Cloud & Local Multi-Mode)
=============================================================
"""

import asyncio
import json
import os
import threading
import time
import sys
from datetime import datetime
from pathlib import Path
from typing import List

try:
    import serial
    import uvicorn
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    from openpyxl import Workbook, load_workbook
    import pymysql
    import requests
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
except ImportError as e:
    print(f"❌ Erreur: Il manque une bibliothèque. Tapez: pip install pyserial fastapi uvicorn openpyxl PyMySQL requests")
    sys.exit(1)

# ─── 1. CONFIGURATION ─────────────────────────────────────
SERIAL_PORT = os.environ.get("SERIAL_PORT", "COM2")  
BAUD_RATE   = 9600
CSV_LOG_DIR = Path(__file__).parent / "logs"

# Configuration MySQL (Clever Cloud)
DB_HOST     = os.environ.get("DB_HOST", "localhost")
DB_USER     = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME     = os.environ.get("DB_NAME", "oncf_z2m")
DB_PORT     = int(os.environ.get("DB_PORT", 3306))

# Détection de l'environnement Cloud (Render)
IS_RENDER   = os.environ.get("RENDER", "false").lower() == "true"

# URL du serveur distant si exécuté en mode pont local
REMOTE_URL  = os.environ.get("REMOTE_URL", "")

latest_data = {
    "time": "--:--:--", "temp_in": 0.0, "temp_out": 0.0, "delta_t": 0.0,
    "efficiency": 0.0, "pressure": 0.0, "motors": 0, "freq": 0.0,
    "mode": "Initialisation...", "alarm": False, "clogged_alert": False
}

data_lock = threading.Lock()

# ─── 2. BASE DE DONNÉES & LOGGING ─────────────────────────

def init_db():
    """Initialise la table logs dans MySQL si nécessaire."""
    # On ne lance pas si les variables d'environnement par défaut ne sont pas configurées
    if DB_HOST == "localhost" and DB_PASSWORD == "" and not IS_RENDER:
        print("ℹ️ Mode local sans MySQL configuré. Utilisation des rapports Excel uniquement.")
        return
        
    try:
        conn = pymysql.connect(
            host=DB_HOST, user=DB_USER, password=DB_PASSWORD,
            database=DB_NAME, port=DB_PORT, connect_timeout=5
        )
        with conn.cursor() as cursor:
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                time VARCHAR(50),
                temp_in FLOAT,
                temp_out FLOAT,
                delta_t FLOAT,
                efficiency FLOAT,
                pressure FLOAT,
                motors INT,
                freq FLOAT,
                alarm BOOLEAN,
                clogged_alert BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
            conn.commit()
        conn.close()
        print("✅ Connexion et initialisation Clever Cloud MySQL réussies !")
    except Exception as e:
        print(f"⚠️ Connexion MySQL échouée (sauvegarde locale uniquement) : {e}")

def log_to_mysql(data: dict):
    """Enregistre les données dans la base de données MySQL distante."""
    if DB_HOST == "localhost" and DB_PASSWORD == "" and not IS_RENDER:
        return
    try:
        conn = pymysql.connect(
            host=DB_HOST, user=DB_USER, password=DB_PASSWORD,
            database=DB_NAME, port=DB_PORT, connect_timeout=3
        )
        with conn.cursor() as cursor:
            sql = """
            INSERT INTO logs (time, temp_in, temp_out, delta_t, efficiency, pressure, motors, freq, alarm, clogged_alert)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                data["time"], data["temp_in"], data["temp_out"], data["delta_t"],
                data["efficiency"], data["pressure"], data["motors"], data["freq"],
                data["alarm"], data["clogged_alert"]
            ))
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ Erreur d'écriture MySQL : {e}")

def log_to_excel(data: dict):
    """Sauvegarde locale des logs dans un fichier Excel."""
    try:
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        CSV_LOG_DIR.mkdir(parents=True, exist_ok=True)
        filepath = CSV_LOG_DIR / f"Rapport_Supervision_{today}.xlsx"
        
        if not filepath.exists():
            wb = Workbook()
            ws = wb.active
            ws.append(["Heure", "T_IN", "T_OUT", "Delta_T", "Pression", "Freq", "Moteurs"])
            wb.save(filepath)
        
        wb = load_workbook(filepath)
        ws = wb.active
        ws.append([data["time"], data["temp_in"], data["temp_out"], data["delta_t"], data["pressure"], data["freq"], data["motors"]])
        wb.save(filepath)
    except Exception: pass

# ─── 3. APPLICATION WEB (FASTAPI) ─────────────────────────

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class ConnectionManager:
    def __init__(self): self.active_connections = []
    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections: self.active_connections.remove(ws)
    async def broadcast(self, data: dict):
        for ws in self.active_connections:
            try: await ws.send_json(data)
            except: pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: manager.disconnect(ws)

@app.get("/data")
async def get_data(): 
    return latest_data

@app.post("/api/log")
async def receive_log_endpoint(data: dict):
    """Endpoint pour recevoir les logs de simulation du PC local."""
    global latest_data
    dt = data.get("T_IN", 0.0) - data.get("T_OUT", 0.0)
    final = {
        "time": datetime.now().strftime("%H:%M:%S"),
        "temp_in": data.get("T_IN", 0.0), 
        "temp_out": data.get("T_OUT", 0.0),
        "delta_t": round(dt, 1), 
        "efficiency": round(min(100, (dt / 8) * 100), 1) if dt > 0 else 0.0,
        "pressure": data.get("P", 0.0), 
        "motors": data.get("M", 0), 
        "freq": data.get("F", 0.0),
        "mode": "COMPIM CLOUD-BRIDGE", 
        "alarm": data.get("T_IN", 0.0) > 45.0, 
        "clogged_alert": dt < 2.0
    }
    with data_lock: 
        latest_data = final
    log_to_excel(final)
    log_to_mysql(final)
    await manager.broadcast(final)
    return {"status": "success", "received": final}

# ─── 4. SERIAL READER & BRIDGE (LOCAL ONLY) ───────────────

def boucle_serial():
    """Boucle locale qui lit Proteus et transmet les données."""
    global latest_data
    print(f"📡 Tentative d'ouverture du port série {SERIAL_PORT}...")
    while True:
        try:
            with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
                print(f"✅ Connecté à Proteus sur {SERIAL_PORT}")
                while True:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    if line.startswith("{"):
                        try:
                            d = json.loads(line)
                            dt = d.get("T_IN", 0.0) - d.get("T_OUT", 0.0)
                            final = {
                                "time": datetime.now().strftime("%H:%M:%S"),
                                "temp_in": d.get("T_IN", 0.0), 
                                "temp_out": d.get("T_OUT", 0.0),
                                "delta_t": round(dt, 1), 
                                "efficiency": round(min(100, (dt / 8) * 100), 1) if dt > 0 else 0.0,
                                "pressure": d.get("P", 0.0), 
                                "motors": d.get("M", 0), 
                                "freq": d.get("F", 0.0),
                                "mode": "COMPIM REAL-TIME", 
                                "alarm": d.get("T_IN", 0.0) > 45.0, 
                                "clogged_alert": dt < 2.0
                            }
                            
                            with data_lock: 
                                latest_data = final
                            
                            # Enregistrement local
                            log_to_excel(final)
                            log_to_mysql(final)
                            
                            # Envoi au serveur distant s'il est configuré
                            if REMOTE_URL:
                                try:
                                    r = requests.post(f"{REMOTE_URL.rstrip('/')}/api/log", json=d, timeout=3)
                                    if r.status_code == 200:
                                        print("🚀 Données relayées au serveur Cloud avec succès")
                                    else:
                                        print(f"⚠️ Échec du relais HTTP ({r.status_code})")
                                except Exception as re:
                                    print(f"❌ Erreur réseau relais Cloud : {re}")
                                    
                        except Exception as pe:
                            print(f"⚠️ Erreur parsing JSON : {pe}")
        except Exception as e:
            print(f"⚠️ Port {SERIAL_PORT} non disponible (VSPE/Proteus inactifs). Réessai dans 3s...")
            time.sleep(3)

# ─── 5. INTEGRATION FRONTEND & RUN ────────────────────────

# Servir React (Dossier build)
BUILD_DIR = Path(__file__).parent / "build"
if BUILD_DIR.exists():
    app.mount("/static", StaticFiles(directory=BUILD_DIR / "static"), name="static")
    
    @app.get("/{catchall:path}")
    async def serve_react(catchall: str):
        index_path = BUILD_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        return {"error": "React index.html missing"}

if __name__ == "__main__":
    init_db()
    
    # Ne démarrer le thread série que si on n'est pas sur Render
    if not IS_RENDER:
        t = threading.Thread(target=boucle_serial, daemon=True)
        t.start()
        
    print("\n" + "="*50)
    print(f" 🚀 SERVEUR ONCF DEMARRÉ (Mode: {'CLOUD' if IS_RENDER else 'LOCAL'})")
    print(f" 🌐 URL : http://localhost:8000")
    print("="*50 + "\n")
    
    try:
        # Render injecte automatiquement la variable PORT
        port = int(os.environ.get("PORT", 8000))
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    except Exception as e:
        print(f"❌ Erreur Serveur: {e}")
