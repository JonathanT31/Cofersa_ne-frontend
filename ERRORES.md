# Documentación de Errores y Compatibilidad - COFERSA NE

Esta documentación detalla los errores encontrados en el proyecto y los desafíos técnicos para su despliegue en plataformas como Vercel.

## 1. Error de "Pantalla en Blanco" al Navegar
**Síntoma:** Al intentar pasar a otra página, el sistema tarda mucho en cargar y se queda en blanco. Después de recargar, aparece la información.

**Causa Técnica:**
* **Servidor Mono-hilo:** El proyecto utiliza `http.server.HTTPServer` de la librería estándar de Python, el cual es mono-hilo (single-threaded) por defecto. Esto significa que solo puede procesar una solicitud a la vez. Si una solicitud (como la carga de datos de Infocompras) tarda, todas las demás solicitudes de todos los usuarios quedan bloqueadas.
* **Latencia de Infocompras:** El script `static/infocompras.js` realiza una petición a un proxy de Google Apps Script que puede tardar varios segundos. Mientras esta petición está en curso en el servidor o bloqueando el hilo principal si se hiciera síncronamente, el navegador puede agotar el tiempo de espera o mostrar una página incompleta.

**Solución Recomendada:**
* Utilizar un servidor compatible con hilos o procesos (como `ThreadingHTTPServer` o un servidor WSGI como Gunicorn/Uvicorn).
* Optimizar la carga de Infocompras para que sea totalmente asíncrona y no bloquee el renderizado inicial de la UI.

## 2. Compatibilidad con Vercel
Vercel está diseñado principalmente para aplicaciones sin estado (stateless) y funciones Serverless. Este proyecto presenta varios conflictos:

### A. Persistencia de Datos (SQLite)
* **Problema:** El proyecto usa SQLite (`data/cofersa_ne.db`). Vercel utiliza un sistema de archivos de solo lectura en sus funciones Lambda. Cualquier cambio en la base de datos se perderá al reiniciarse la función o no se podrá escribir del todo.
* **Solución:** Migrar a una base de datos externa como PostgreSQL (Vercel Storage), MySQL o MongoDB.

### B. Arquitectura del Servidor
* **Problema:** Vercel espera aplicaciones web basadas en estándares como WSGI (Flask, Django) o ASGI (FastAPI). El uso de `http.server.BaseHTTPRequestHandler` no es compatible directamente con las rutas de Vercel.
* **Solución:** Re-estructurar el enrutamiento usando un framework como Flask o FastAPI, o escribir un adaptador Bridge.

### C. Estado en Memoria y Sesiones
* **Problema:** Las sesiones y cachés se gestionan localmente. En Vercel, cada solicitud puede ser atendida por una instancia diferente de la función, lo que causaría cierres de sesión inesperados.
* **Solución:** Usar Redis o la base de datos para gestionar sesiones de forma centralizada.

## 3. Errores de Código (Bugs Identificados)
* **Duplicación Masiva de Código:** El archivo `main.py` contiene un bloque de aproximadamente 300 líneas duplicadas al final del archivo (desde el cierre del bloque de ejecución del servidor), lo cual puede causar comportamientos erráticos o errores de sintaxis dependiendo de la versión de Python.
* **Error de Plantilla en Presupuesto:** En la función `page_admin_presupuesto`, el uso de `chr(123)}esc(ppto_import_error){chr(125)}` dentro de un f-string produce que se muestren las llaves literales en lugar de ejecutar la función de escape, resultando en una visualización incorrecta de errores.

## 4. Rendimiento
* **Carga de Infocompras:** La dependencia de un script de Google Apps Script externo añade una latencia significativa (3-5 segundos) en el primer inicio de sesión.
* **Falta de Compresión:** El servidor no comprime los recursos estáticos (JS/CSS), aumentando el tiempo de carga en conexiones lentas.
