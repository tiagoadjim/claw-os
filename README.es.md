# Claw OS

Claw OS es una aplicación de escritorio para crear y usar agentes de IA sin depender de una terminal. Está construida sobre OpenClaw con Electron, React, Vite y TypeScript.

## Experiencia principal

- Conversa con tu agente y revisa el progreso de cada tarea.
- Ponle un nombre al agente durante el onboarding.
- Inicia sesión con ChatGPT para usar una suscripción compatible o configura otros proveedores.
- Conecta aplicaciones desde la solapa **Conectores**, que carga el catálogo en vivo de Composio.
- Agrega skills, canales, plugins y automatizaciones sin perder acceso a las opciones avanzadas.
- Interfaz disponible en inglés y español.

## Conectores de Composio

Claw OS guarda la clave de proyecto de Composio en el proceso Main, crea una sesión Tool Router y registra su URL MCP en el Gateway de OpenClaw. La clave se inyecta de forma segura al Gateway: la interfaz nunca vuelve a recibirla sin máscara y tampoco se escribe en `openclaw.json`. Al conectar un servicio, Claw OS abre el flujo de autenticación alojado por Composio en el navegador del sistema.

El catálogo no contiene una lista fija: se consulta desde Composio para incluir todos los servicios disponibles en el proyecto del usuario.

## Desarrollo

```bash
corepack enable
pnpm run init
pnpm dev
```

Validaciones principales:

```bash
pnpm run lint:check
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run harness:ci
```

Consulta [README.md](README.md) para la documentación técnica completa, arquitectura, empaquetado y solución de problemas.
