<?php
/*
 * Mosaik – Konten und Spielstände.
 * Liegt neben index.html auf dem Webspace. Braucht PHP 7.4 oder neuer.
 *
 * EINRICHTEN: Trage unten einen eigenen Familiencode ein. Nur wer ihn kennt,
 * kann ein neues Konto anlegen. Solange der Code "BITTE-AENDERN" lautet,
 * ist die Kontoerstellung gesperrt.
 */
const FAMILY_CODE = 'BITTE-AENDERN';

const MAX_USERS = 30;            // höchstens so viele Konten
const MAX_SAVE_BYTES = 300000;   // Größe eines Spielstands
const MAX_TOKENS = 12;           // gleichzeitig angemeldete Geräte je Konto
const LOCK_AFTER = 8;            // Fehlversuche bis zur Sperre
const LOCK_SECONDS = 300;        // Dauer der Sperre

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(['ok' => false, 'error' => $msg], $code); }

// Datenordner: Dateien enden auf .php und beginnen mit einer Sperrzeile,
// damit sie über den Browser nie lesbar sind (zusätzlich .htaccess).
$dir = __DIR__ . '/mosaik-daten';
if (!is_dir($dir)) {
  if (!@mkdir($dir, 0700, true)) fail('Der Datenordner konnte nicht angelegt werden. Bitte Schreibrechte für den Ordner des Spiels prüfen.', 500);
  @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
  @file_put_contents("$dir/index.html", '');
}
const GUARD = "<?php http_response_code(404); exit; ?>\n";

function keyOf($name) { return hash('sha256', mb_strtolower(trim($name), 'UTF-8')); }
function pathOf($key) { global $dir; return "$dir/u_$key.php"; }
function readUser($key) {
  $p = pathOf($key);
  if (!is_file($p)) return null;
  $raw = file_get_contents($p);
  if ($raw === false) return null;
  $json = substr($raw, strlen(GUARD));
  $u = json_decode($json, true);
  return is_array($u) ? $u : null;
}
function writeUser($key, $u) {
  $p = pathOf($key);
  $tmp = $p . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (file_put_contents($tmp, GUARD . json_encode($u, JSON_UNESCAPED_UNICODE), LOCK_EX) === false) fail('Speichern fehlgeschlagen.', 500);
  if (!rename($tmp, $p)) { @unlink($tmp); fail('Speichern fehlgeschlagen.', 500); }
}
function userCount() { global $dir; return count(glob("$dir/u_*.php") ?: []); }
function validName($n) { return is_string($n) && preg_match('/^[\p{L}\p{N} ._-]{2,24}$/u', trim($n)); }
function newToken(&$u) {
  $t = bin2hex(random_bytes(32));
  $u['tokens'] = array_slice(array_merge($u['tokens'] ?? [], [['h' => hash('sha256', $t), 'at' => time()]]), -MAX_TOKENS);
  return $t;
}
function findByToken($name, $token) {
  if (!validName($name) || !is_string($token) || strlen($token) !== 64) fail('Bitte melde dich neu an.', 401);
  $key = keyOf($name);
  $u = readUser($key);
  if (!$u) fail('Bitte melde dich neu an.', 401);
  $h = hash('sha256', $token);
  foreach ($u['tokens'] ?? [] as $tk) if (hash_equals($tk['h'], $h)) return [$key, $u];
  fail('Bitte melde dich neu an.', 401);
}

// Spielstände zusammenführen: gelöste Bilder bleiben, beste Sterne gewinnen
function mergeSave($old, $new) {
  if (!is_array($old)) return $new;
  if (!is_array($new)) return $old;
  $solved = is_array($old['solved'] ?? null) ? $old['solved'] : [];
  foreach (($new['solved'] ?? []) as $id => $rec) {
    if (!is_array($rec)) continue;
    if (!isset($solved[$id]) || ($rec['stars'] ?? 0) >= ($solved[$id]['stars'] ?? 0)) $solved[$id] = $rec;
  }
  $new['solved'] = (object)$solved;
  return $new;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') out(['ok' => true, 'app' => 'mosaik', 'register' => FAMILY_CODE !== 'BITTE-AENDERN']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Nur POST.', 405);

$body = file_get_contents('php://input');
if (strlen($body) > MAX_SAVE_BYTES + 4096) fail('Zu groß.', 413);
$in = json_decode($body, true);
if (!is_array($in)) fail('Ungültige Anfrage.');
$action = $in['action'] ?? '';

switch ($action) {
  case 'register': {
    if (FAMILY_CODE === 'BITTE-AENDERN') fail('Neue Konten sind noch nicht freigeschaltet. In api.php muss erst ein Familiencode eingetragen werden.', 403);
    if (!hash_equals(FAMILY_CODE, (string)($in['code'] ?? ''))) { sleep(2); fail('Der Familiencode stimmt nicht.', 403); }
    $name = trim((string)($in['name'] ?? '')); $pw = (string)($in['password'] ?? '');
    if (!validName($name)) fail('Der Name muss 2 bis 24 Zeichen haben (Buchstaben, Ziffern, Leerzeichen, Punkt, Bindestrich).');
    if (mb_strlen($pw) < 4 || mb_strlen($pw) > 200) fail('Das Passwort muss mindestens 4 Zeichen haben.');
    $key = keyOf($name);
    if (readUser($key)) fail('Diesen Namen gibt es schon. Bitte melde dich an oder wähle einen anderen.', 409);
    if (userCount() >= MAX_USERS) fail('Es gibt schon zu viele Konten.', 403);
    $save = $in['save'] ?? null;
    if ($save !== null && (!is_array($save) || strlen(json_encode($save)) > MAX_SAVE_BYTES)) $save = null;
    $u = ['name' => $name, 'hash' => password_hash($pw, PASSWORD_DEFAULT), 'tokens' => [], 'save' => $save, 'updated' => time(), 'fails' => 0, 'lockUntil' => 0];
    $t = newToken($u);
    writeUser($key, $u);
    out(['ok' => true, 'name' => $name, 'token' => $t, 'save' => $u['save']]);
  }
  case 'login': {
    $name = trim((string)($in['name'] ?? '')); $pw = (string)($in['password'] ?? '');
    if (!validName($name)) fail('Name oder Passwort stimmt nicht.', 401);
    $key = keyOf($name);
    $u = readUser($key);
    if (!$u) { password_verify($pw, password_hash('mosaik', PASSWORD_DEFAULT)); fail('Name oder Passwort stimmt nicht.', 401); }
    if (($u['lockUntil'] ?? 0) > time()) fail('Zu viele Fehlversuche. Bitte in ein paar Minuten noch einmal versuchen.', 429);
    if (!password_verify($pw, $u['hash'])) {
      $u['fails'] = ($u['fails'] ?? 0) + 1;
      if ($u['fails'] >= LOCK_AFTER) { $u['fails'] = 0; $u['lockUntil'] = time() + LOCK_SECONDS; }
      writeUser($key, $u);
      fail('Name oder Passwort stimmt nicht.', 401);
    }
    $u['fails'] = 0; $u['lockUntil'] = 0;
    if (password_needs_rehash($u['hash'], PASSWORD_DEFAULT)) $u['hash'] = password_hash($pw, PASSWORD_DEFAULT);
    $local = $in['save'] ?? null;
    if (is_array($local) && strlen(json_encode($local)) <= MAX_SAVE_BYTES) $u['save'] = mergeSave($local, $u['save']);
    $t = newToken($u);
    writeUser($key, $u);
    out(['ok' => true, 'name' => $u['name'], 'token' => $t, 'save' => $u['save']]);
  }
  case 'load': {
    [$key, $u] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    out(['ok' => true, 'name' => $u['name'], 'save' => $u['save'], 'updated' => $u['updated'] ?? 0]);
  }
  case 'save': {
    [$key, $u] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    $save = $in['save'] ?? null;
    if (!is_array($save)) fail('Ungültiger Spielstand.');
    if (strlen(json_encode($save)) > MAX_SAVE_BYTES) fail('Spielstand zu groß.', 413);
    $u['save'] = !empty($in['reset']) ? $save : mergeSave($u['save'], $save);
    $u['updated'] = time();
    writeUser($key, $u);
    out(['ok' => true, 'save' => $u['save']]);
  }
  case 'logout': {
    [$key, $u] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    $h = hash('sha256', (string)$in['token']);
    $u['tokens'] = array_values(array_filter($u['tokens'] ?? [], function ($tk) use ($h) { return !hash_equals($tk['h'], $h); }));
    writeUser($key, $u);
    out(['ok' => true]);
  }
  default: fail('Unbekannte Aktion.');
}
