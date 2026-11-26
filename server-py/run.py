#!/usr/bin/python3
"""Deployment launcher for iStoreOS: sets router paths before importing the app."""
import os
import uvicorn

os.environ.setdefault("PORT", "8766")
os.environ.setdefault("HOST", "0.0.0.0")
os.environ.setdefault("KANBAN_DATA_DIR", "/mnt/sata2-4/kanban/data")
os.environ.setdefault("DIST_DIR", "/opt/kanban/app")
os.environ.setdefault("ALLOW_REGISTRATION", "false")

import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        app.app,
        host=os.environ["HOST"],
        port=int(os.environ["PORT"]),
        log_level="info",
    )
