// ============================================================
//  RECOVERY LAB – Google Apps Script Backend
//  Deploy as Web App: Execute as Me, Anyone can access
//
//  SETUP (do this in order):
//  1. Paste this code into your Apps Script project
//  2. Run createSheet() once — check Logs for the Sheet ID
//  3. Paste that ID into SPREADSHEET_ID below
//  4. Deploy as Web App (Execute as: Me, Access: Anyone)
//  5. Copy the Web App URL into form.html and dashboard.html
// ============================================================

var SHEET_NAME     = "Responses";
var SPREADSHEET_ID = "1knnsAeZPZNUaKRsE13nCG18bzENIcjvRxvJ42qNF4UM"; // ← paste ID here after running createSheet()
var SHEET_HEADERS = [
  "Timestamp", "Auditor",
  "S1 Booking %", "S2 Arrival %", "S3 Check-In %", "S4 Communication %",
  "S5 Facility %", "S6 Cleanliness %", "S7 Atmosphere %", "S8 Service %",
  "S9 Privacy %", "S10 Flow %", "S11 Tipping %", "S12 Payment %",
  "S13 Post-Visit %", "S14 Final %",
  "Overall Score %", "Score Label",
  "Total Yes", "Total No",
  "Issues (JSON)", "Open Answers (JSON)", "Raw Answers (JSON)",
  "Branch", "Therapist", "Services", "Has Moroccan"
];

// ── Run once to create the Google Sheet ────────────────────
function createSheet() {
  var ss = SpreadsheetApp.create("Recovery Lab – Audit Responses");
  Logger.log("✅ Sheet created! Copy this ID into SPREADSHEET_ID:");
  Logger.log(ss.getId());
  Logger.log("Open it here: " + ss.getUrl());
}

// ── Internal helper ────────────────────────────────────────
function getSheet() {
  if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is empty. Run createSheet() first, then paste the ID.");
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length)
         .setFontWeight("bold")
         .setBackground("#0F6E56")
         .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    return;
  }

  var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var mergedHeaders = existingHeaders.slice();
  var changed = false;

  SHEET_HEADERS.forEach(function(header) {
    if (mergedHeaders.indexOf(header) === -1) {
      mergedHeaders.push(header);
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);
    sheet.getRange(1, 1, 1, mergedHeaders.length)
         .setFontWeight("bold")
         .setBackground("#0F6E56")
         .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
}

function resolveTotals(data) {
  var answers = data.answers || {};
  var issues = Array.isArray(data.issues) ? data.issues : [];
  var answeredCount = 0;

  Object.keys(answers).forEach(function(key) {
    if (/^q\d+_\d+$/.test(key) && (answers[key] === "yes" || answers[key] === "no")) {
      answeredCount++;
    }
  });

  return {
    totalYes: Math.max(answeredCount - issues.length, 0),
    totalNo: issues.length
  };
}

function toNumber(value) {
  var num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// ── POST: receive a form submission ────────────────────────
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var sheet = getSheet();
    ensureHeaders(sheet);

    var overall = toNumber(data.overall);
    if (overall === null) overall = toNumber(data.final);
    if (overall === null) overall = 0;

    var totals = resolveTotals(data);
    var totalYes = toNumber(data.totalY);
    var totalNo = toNumber(data.totalN);
    if (totalYes === null) totalYes = totals.totalYes;
    if (totalNo === null) totalNo = totals.totalNo;
    var branch = data.branch || (data.answers && data.answers._branch) || "";
    var therapist = data.therapist || (data.answers && data.answers._therapist) || "";
    var services = data.services || (data.answers && Array.isArray(data.answers._services) ? data.answers._services.join(", ") : "");
    var hasMoroccan = data.hasMoroccan;
    if (hasMoroccan === undefined || hasMoroccan === null || hasMoroccan === "") {
      hasMoroccan = !!(data.answers && Array.isArray(data.answers._services) && (
        data.answers._services.indexOf("Moroccan Bath") > -1 || data.answers._services.indexOf("Hammam") > -1
      ));
    }

    var sectionOrder = ["s1","s2","s3","s4","s5","s6","s7","s8","s9","s10","s11","s12","s13","s14"];
    var sectionPcts  = sectionOrder.map(function(sid) {
      var sc = data.sectionScores && data.sectionScores[sid];
      return (sc && sc.pct !== null && sc.pct !== undefined) ? sc.pct : "";
    });

    var label = overall >= 90 ? "Excellent"
              : overall >= 75 ? "Good"
              : overall >= 60 ? "Needs Improvement"
              :                      "Poor";

    var row = [
      new Date(data.ts),
      data.auditor || "Anonymous"
    ].concat(sectionPcts).concat([
      overall,
      label,
      totalYes,
      totalNo,
      JSON.stringify(data.issues      || []),
      JSON.stringify(data.openAnswers || {}),
      JSON.stringify(data.answers     || {}),
      branch,
      therapist,
      services,
      hasMoroccan
    ]);

    sheet.appendRow(row);

    var lastRow    = sheet.getLastRow();
    var overallCol = 17;
    var cell = sheet.getRange(lastRow, overallCol);
    if      (overall >= 90) cell.setBackground("#EAF3DE");
    else if (overall >= 75) cell.setBackground("#E1F5EE");
    else if (overall >= 60) cell.setBackground("#FAEEDA");
    else                         cell.setBackground("#FCEBEB");

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── GET: return all rows for the dashboard ─────────────────
function doGet(e) {
  try {
    var sheet = getSheet();

    if (sheet.getLastRow() <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "ok", rows: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var values  = sheet.getDataRange().getValues();
    var headers = values[0];
    var rows    = [];

    for (var i = 1; i < values.length; i++) {
      var row = {};
      headers.forEach(function(h, j) { row[h] = values[i][j]; });
      rows.push(row);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", rows: rows }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}