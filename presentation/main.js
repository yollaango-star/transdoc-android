// TransDoc — application de PRÉSENTATION pour ordinateur (Electron) : une fenêtre qui affiche presentation/app/index.html.
// Aucun réseau n'est nécessaire : le registre est simulé dans l'application (registre-local.js).
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

function fenetre() {
  const w = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 600,
    title: 'TransDoc Gabon — Présentation', backgroundColor: '#F3F6F1', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  w.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Liens externes : navigateur de l'ordinateur ; la fenêtre reste sur l'application
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(() => {
  // Caméra autorisée pour le scan des codes QR ; tout le reste est refusé
  session.defaultSession.setPermissionRequestHandler((wc, permission, accorder) => accorder(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');
  fenetre();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) fenetre(); });
});
app.on('window-all-closed', () => app.quit());
