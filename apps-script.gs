// ─────────────────────────────────────────────────────────────────────────────
// POLICY HUB — Google Apps Script Backend
// ─────────────────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS:
//  1. Open a new Google Sheet (this becomes your database)
//  2. In the Sheet, go to Extensions → Apps Script
//  3. Delete all default code and paste this entire file
//  4. Click Save, then Deploy → New deployment
//     • Type: Web app
//     • Execute as: Me
//     • Who has access: Anyone
//  5. Click Deploy, copy the Web App URL
//  6. Paste that URL into the Policy Hub HTML admin panel (Setup tab)
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_SHEET    = 'Config';
const RESPONSES_SHEET = 'Responses';

// ── GET handler (read operations) ────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  let result;

  try {
    if (action === 'getAll') {
      // Returns all config in one call to minimize round trips
      result = {
        content:   getConfig('content'),
        feedback:  getConfig('feedback'),
        pw:        getConfig('pw') || 'admin',
        ok:        true
      };
    } else if (action === 'getResponses') {
      result = { responses: getResponses(), ok: true };
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return jsonResponse(result);
}

// ── POST handler (write operations) ──────────────────────────────────────────
function doPost(e) {
  let result;

  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'saveContent') {
      setConfig('content', data.payload);
      result = { ok: true };

    } else if (action === 'saveFeedback') {
      setConfig('feedback', data.payload);
      result = { ok: true };

    } else if (action === 'submitResponse') {
      appendResponse(data.payload);
      result = { ok: true };

    } else if (action === 'changePW') {
      setConfig('pw', data.payload);
      result = { ok: true };

    } else if (action === 'clearResponses') {
      clearResponses();
      result = { ok: true };

    } else if (action === 'translate') {
      // Uses Google's built-in LanguageApp translation service (no API key needed)
      const targetLang = data.targetLang; // e.g. 'uk' or 'ar'
      const texts      = data.texts;      // array of strings
      if (!targetLang || !Array.isArray(texts)) {
        result = { error: 'Missing targetLang or texts' };
      } else {
        const translated = texts.map(t => {
          if (!t || !t.trim()) return t;
          try {
            return LanguageApp.translate(t, 'en', targetLang);
          } catch(err) {
            return t; // fall back to original on error
          }
        });
        result = { translated, ok: true };
      }

    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return jsonResponse(result);
}

// ── Config helpers ────────────────────────────────────────────────────────────
function getConfig(key) {
  const sheet = getOrCreateSheet(CONFIG_SHEET);
  const data  = sheet.getDataRange().getValues();
  for (const row of data) {
    if (row[0] === key) {
      try { return JSON.parse(row[1]); } catch { return row[1]; }
    }
  }
  return null;
}

function setConfig(key, value) {
  const sheet = getOrCreateSheet(CONFIG_SHEET);
  const data  = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(value));
      return;
    }
  }
  sheet.appendRow([key, JSON.stringify(value)]);
}

// ── Response helpers ──────────────────────────────────────────────────────────
function getResponses() {
  const sheet = getOrCreateSheet(RESPONSES_SHEET);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  // Row format: [timestamp, json_blob]
  return data.slice(1)
    .map(row => { try { return JSON.parse(row[1]); } catch { return null; } })
    .filter(Boolean);
}

function appendResponse(record) {
  const sheet = getOrCreateSheet(RESPONSES_SHEET);

  // Create header row if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Response JSON']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  }

  sheet.appendRow([record.timestamp, JSON.stringify(record)]);
}

function clearResponses() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(RESPONSES_SHEET);
  if (!sheet) return;
  ss.deleteSheet(sheet);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function getOrCreateSheet(name) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
