# 🖥️ Guía Completa: Montar tu Servidor Web desde tu PC

Guía para levantar tu propio servidor web desde tu PC, exponerlo con una URL pública y tenerlo disponible la mayor parte del tiempo posible.

---

## 🧱 Arquitectura Recomendada

```
Internet → Tu dominio (DDNS) → Router (Port Forward) → Tu PC → Docker → Apps
```

La arquitectura más moderna y flexible usa **Docker + Nginx como reverse proxy** + **DDNS**.  
Así puedes tener múltiples apps corriendo en la misma PC y acceder a cada una por URL diferente.

---

## PASO 1 — Prepara tu PC

| Requisito | Recomendación |
|-----------|--------------|
| **OS** | Linux (Ubuntu 24.04 LTS) recomendado, o Windows con WSL2 |
| **Conexión** | Cable Ethernet, no WiFi |
| **Energía** | UPS para evitar cortes |
| **RAM mínima** | 4GB (8GB recomendado) |
| **Disco** | SSD para mejor rendimiento |

### 🐧 Linux (Ubuntu):
```bash
sudo apt update && sudo apt upgrade -y
```

### 🪟 Windows:
Instala **WSL2** con Ubuntu:
```powershell
wsl --install
```
> Reinicia tu PC después de instalar WSL2.

---

## PASO 2 — Instala Docker y Docker Compose

Docker permite correr múltiples apps aisladas sin conflictos.

### 🐧 Linux:
```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Agregar tu usuario al grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verificar instalación
docker --version
docker compose version
```

### 🪟 Windows:
1. Descarga e instala **Docker Desktop**: https://www.docker.com/products/docker-desktop/
2. Asegúrate de activar la integración con WSL2 en **Settings → Resources → WSL Integration**
3. Verifica en PowerShell o CMD:
```powershell
docker --version
docker compose version
```

---

## PASO 3 — Configura IP Estática Local

Tu PC necesita una IP fija dentro de tu red local para que el router siempre dirija el tráfico correctamente.

### 🐧 Linux (Netplan):
```yaml
# /etc/netplan/01-config.yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```
```bash
sudo netplan apply
```

### 🪟 Windows:
1. Panel de Control → Centro de redes → Cambiar configuración del adaptador
2. Clic derecho en tu adaptador Ethernet → Propiedades
3. Selecciona **Protocolo de Internet versión 4 (TCP/IPv4)** → Propiedades
4. Ingresa:
   - IP: `192.168.1.100`
   - Máscara: `255.255.255.0`
   - Puerta de enlace: `192.168.1.1`
   - DNS: `8.8.8.8`

---

## PASO 4 — Configura Port Forwarding en tu Router

1. Entra a tu router: `http://192.168.1.1` (o `192.168.0.1`)
2. Busca **"Port Forwarding"** o **"NAT"**
3. Crea dos reglas:

| Puerto externo | Puerto interno | IP destino | Protocolo |
|----------------|----------------|------------|-----------|
| 80 | 80 | 192.168.1.100 | TCP |
| 443 | 443 | 192.168.1.100 | TCP |
|
> ⚠️ Algunos ISPs bloquean el puerto 80. Si es tu caso, usa el puerto **8080** externo → **80** interno.

---

## PASO 5 — Configura DDNS (DNS Dinámico)

Tu IP pública cambia con frecuencia. Un DDNS la mantiene apuntando a tu dominio automáticamente.

### Opción A — DuckDNS (gratis)
1. Ve a https://www.duckdns.org y crea una cuenta
2. Crea un subdominio, ej: `miservidor.duckdns.org`

#### 🐧 Linux — Script de actualización automática:
```bash
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh << 'EOF'
echo url="https://www.duckdns.org/update?domains=TU_DOMINIO&token=TU_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF

chmod +x ~/duckdns/duck.sh

# Actualización automática cada 5 minutos
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1") | crontab -
```

#### 🪟 Windows — Descarga el cliente oficial:
1. Ve a https://www.duckdns.org → Windows tray app
2. Descarga e instala el cliente
3. Ingresa tu token y dominio — se actualiza automáticamente en segundo plano

### Opción B — Cloudflare (más profesional)
Compra un dominio (ej: `miservidor.com`) en Namecheap o Porkbun (~$10/año) y usa **Cloudflare** como DNS gratuito con actualización dinámica.

---

## PASO 6 — Nginx Reverse Proxy + HTTPS automático

Crea la carpeta del proyecto y el archivo `docker-compose.yml`:

### 🐧 Linux:
```bash
mkdir -p ~/servidor/npm
cd ~/servidor
```

### 🪟 Windows (PowerShell):
```powershell
mkdir C:\servidor\npm
cd C:\servidor
```

### Archivo `docker-compose.yml` (igual para ambos):
```yaml
version: '3.8'

services:
  nginx-proxy-manager:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '81:81'   # Panel de administración
    volumes:
      - ./npm/data:/data
      - ./npm/letsencrypt:/etc/letsencrypt
```

```bash
docker compose up -d
```

Accede al panel en: `http://192.168.1.100:81`
- **Email:** `admin@example.com`
- **Password:** `changeme`

> ⚠️ Cambia las credenciales inmediatamente después del primer login.

---

## PASO 7 — Despliega tus Apps con Docker

```yaml
version: '3.8'

services:

  # App 1: Nextcloud (almacenamiento en la nube)
  nextcloud:
    image: nextcloud:latest
    container_name: nextcloud
    restart: unless-stopped
    ports:
      - "8081:80"
    volumes:
      - ./nextcloud:/var/www/html

  # App 2: Gitea (Git personal)
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    restart: unless-stopped
    ports:
      - "8082:3000"
    volumes:
      - ./gitea:/data

  # App 3: Portainer (gestión de Docker)
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./portainer:/data
```

```bash
docker compose up -d
```

---

## PASO 8 — Configura URLs en Nginx Proxy Manager

En el panel (`http://192.168.1.100:81`) → **"Proxy Hosts"** → **"Add Proxy Host"**:

| Dominio | Forward Host | Forward Port |
|---------|-------------|--------------|
| `nextcloud.miservidor.duckdns.org` | `192.168.1.100` | `8081` |
| `git.miservidor.duckdns.org` | `192.168.1.100` | `8082` |
| `portainer.miservidor.duckdns.org` | `192.168.1.100` | `9000` |

En la pestaña **"SSL"** → selecciona **"Let's Encrypt"** → activa **"Force SSL"** ✅

---

## PASO 9 — Alta Disponibilidad

### 🐧 Linux:
```bash
# Habilitar Docker al iniciar el sistema
sudo systemctl enable docker

# Desactivar suspensión automática
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Monitorear recursos
docker stats
```

### 🪟 Windows:
- Panel de Control → Opciones de energía → **"Alto rendimiento"**
- Desactivar la suspensión e hibernación
- Docker Desktop → Settings → **"Start Docker Desktop when you log in"** ✅

---

## PASO 10 — Seguridad Básica

### 🐧 Linux:
```bash
# Instalar Fail2Ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban

# Configurar firewall UFW
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Actualizaciones automáticas de seguridad
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 🪟 Windows:
- Asegúrate de tener **Windows Defender** activo
- Abre los puertos en el Firewall de Windows:
  1. Busca **"Firewall de Windows Defender con seguridad avanzada"**
  2. **Reglas de entrada** → Nueva regla → Puerto → TCP → 80, 443
- Mantén Windows actualizado con **Windows Update**

---

## 📊 Resumen del Flujo Final

```
miservidor.duckdns.org
        │
        ▼
   Tu Router (Port 80/443)
        │
        ▼
   Nginx Proxy Manager (Docker)
   ┌────┴──────────────────────────┐
   │                               │
   ▼                               ▼
nextcloud.miservidor.duckdns.org  git.miservidor.duckdns.org
   │                               │
   ▼                               ▼
Nextcloud (Puerto 8081)        Gitea (Puerto 8082)
```

---

## ⚠️ Limitaciones Comunes

| Problema | Solución |
|----------|----------|
| ISP bloquea puerto 80/443 | Usa **Cloudflare Tunnel** (gratis) |
| IP pública dinámica | DuckDNS o Cloudflare DDNS |
| Cortes de luz | UPS |
| ISP con CGNAT | Usa **Cloudflare Tunnel** o **Tailscale** |

---

## 🌐 Alternativa: Cloudflare Tunnel (Sin abrir puertos)

Si tu ISP bloquea puertos o tienes CGNAT, esta es la mejor alternativa. **No necesitas abrir ningún puerto en tu router.**

### 🐧 Linux:
```bash
# Instalar cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Autenticarte
cloudflared tunnel login

# Crear un túnel
cloudflared tunnel create mi-servidor

# Correr el túnel
cloudflared tunnel run mi-servidor
```

### 🪟 Windows:
1. Descarga `cloudflared-windows-amd64.exe` desde: https://github.com/cloudflare/cloudflared/releases
2. Renómbralo a `cloudflared.exe` y muévelo a `C:\cloudflared\`
3. Abre PowerShell como administrador y ejecuta:
```powershell
cd C:\cloudflared
.\cloudflared.exe tunnel login
.\cloudflared.exe tunnel create mi-servidor
.\cloudflared.exe tunnel run mi-servidor
```

---

> 📌 Guía creada con ayuda de GitHub Copilot — 2026