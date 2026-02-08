from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import json
import asyncio

app = FastAPI(title="MandalaBurn", version="0.1.0")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/lib", StaticFiles(directory=FRONTEND_DIR / "lib"), name="lib")


@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "index.html")


def list_serial_ports():
    """List available serial ports."""
    ports = []
    try:
        import serial.tools.list_ports
        for p in serial.tools.list_ports.comports():
            ports.append({
                "device": p.device,
                "description": p.description,
                "hwid": p.hwid
            })
    except ImportError:
        pass
    return ports


@app.get("/api/ports")
async def get_ports():
    return {"ports": list_serial_ports()}


# Serial connection state (per-session, simple single-user)
class MachineConnection:
    def __init__(self):
        self.serial = None
        self.port = None
        self.baud = 115200
        self._reader_task = None

    def connect(self, port: str, baud: int = 115200):
        try:
            import serial
            self.serial = serial.Serial(port, baud, timeout=0.1)
            self.port = port
            self.baud = baud
            return True
        except Exception as e:
            self.serial = None
            return False

    def disconnect(self):
        if self.serial:
            try:
                self.serial.close()
            except Exception:
                pass
            self.serial = None

    def send(self, cmd: str):
        if self.serial and self.serial.is_open:
            self.serial.write((cmd.strip() + '\n').encode())
            return True
        return False

    def read_line(self):
        if self.serial and self.serial.is_open and self.serial.in_waiting:
            try:
                return self.serial.readline().decode().strip()
            except Exception:
                return None
        return None

    @property
    def is_connected(self):
        return self.serial is not None and self.serial.is_open


machine = MachineConnection()


@app.websocket("/ws/machine")
async def websocket_machine(ws: WebSocket):
    await ws.accept()

    # Background task to read serial and send position updates
    async def serial_reader():
        while True:
            if machine.is_connected:
                # Request status report (GRBL: ?)
                machine.send('?')
                await asyncio.sleep(0.05)
                line = machine.read_line()
                while line:
                    # Parse GRBL status: <Idle|MPos:0.000,0.000,0.000|...>
                    if line.startswith('<') and 'MPos:' in line:
                        try:
                            mpos = line.split('MPos:')[1].split('|')[0]
                            parts = mpos.split(',')
                            x, y = float(parts[0]), float(parts[1])
                            await ws.send_json({"type": "position", "x": x, "y": y})
                        except (IndexError, ValueError):
                            pass
                    elif line == 'ok':
                        pass  # command acknowledged
                    elif line.startswith('error'):
                        await ws.send_json({"type": "error", "text": line})
                    else:
                        await ws.send_json({"type": "status", "text": line})
                    line = machine.read_line()
            await asyncio.sleep(0.2)

    reader_task = asyncio.create_task(serial_reader())

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            if msg["type"] == "connect":
                port = msg.get("port", "")
                baud = msg.get("baud", 115200)
                if port:
                    ok = machine.connect(port, baud)
                    if ok:
                        await ws.send_json({"type": "connected", "port": port})
                    else:
                        await ws.send_json({"type": "error", "text": f"Cannot open {port}"})
                else:
                    await ws.send_json({"type": "error", "text": "No port specified"})

            elif msg["type"] == "disconnect":
                machine.disconnect()
                await ws.send_json({"type": "disconnected"})

            elif msg["type"] == "gcode":
                cmd = msg.get("data", "")
                if machine.is_connected:
                    machine.send(cmd)
                else:
                    await ws.send_json({"type": "error", "text": "Not connected"})

            elif msg["type"] == "list_ports":
                ports = list_serial_ports()
                await ws.send_json({"type": "ports", "ports": ports})

    except WebSocketDisconnect:
        pass
    finally:
        reader_task.cancel()
        machine.disconnect()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
