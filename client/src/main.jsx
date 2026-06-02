import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { migrateLegacyStorageKeys } from "./config/legacyStorageMigration";
import "./styles/index.css";

// One-shot rebrand migration: copy any leftover vantage.* localStorage
// keys to their vorge.* counterparts before React mounts.
migrateLegacyStorageKeys();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
