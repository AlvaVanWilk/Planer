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
const DROPS = 4;                 // Familientropfen je Person im Gemeinschaftswerk
const DROP_BACK = 7200;          // ein verlorener Tropfen kommt nach 2 Stunden zurück

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

// Besser: mehr Sterne, bei gleichen Sternen schneller
function betterRec($a, $b) {
  $sa = (int)($a['stars'] ?? 0); $sb = (int)($b['stars'] ?? 0);
  if ($sa !== $sb) return $sa > $sb;
  return (int)($a['time'] ?? PHP_INT_MAX) < (int)($b['time'] ?? PHP_INT_MAX);
}

// Spielstände zusammenführen: gelöste Bilder bleiben, beste Sterne gewinnen
function mergeSave($old, $new) {
  if (!is_array($old)) return $new;
  if (!is_array($new)) return $old;
  $solved = is_array($old['solved'] ?? null) ? $old['solved'] : [];
  foreach (($new['solved'] ?? []) as $id => $rec) {
    if (!is_array($rec)) continue;
    if (!isset($solved[$id]) || betterRec($rec, $solved[$id])) $solved[$id] = $rec;
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
  case 'board': {
    [$key, $me] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    $pic = (string)($in['pic'] ?? '');
    if (!preg_match('/^[a-z0-9_-]{1,32}$/', $pic)) fail('Unbekanntes Bild.');
    $list = [];
    foreach (glob("$dir/u_*.php") ?: [] as $f) {
      $u = readUser(substr(basename($f, '.php'), 2));
      $rec = $u['save']['solved'][$pic] ?? null;
      if (!is_array($rec) || !isset($rec['time'])) continue;
      $list[] = ['name' => $u['name'], 'stars' => max(0, min(3, (int)($rec['stars'] ?? 0))), 'time' => max(0, (int)$rec['time']), 'me' => $u['name'] === $me['name']];
    }
    usort($list, function ($a, $b) { return $b['stars'] <=> $a['stars'] ?: $a['time'] <=> $b['time']; });
    foreach ($list as $i => &$e) $e['rank'] = $i + 1;
    out(['ok' => true, 'entries' => $list]);
  }
  case 'family': {
    [$key, $me] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    $users = [];
    foreach (glob("$dir/u_*.php") ?: [] as $f) {
      $u = readUser(substr(basename($f, '.php'), 2));
      if (!$u) continue;
      $solved = [];
      foreach (($u['save']['solved'] ?? []) as $id => $rec) {
        if (!is_array($rec) || !preg_match('/^[a-z0-9_-]{1,32}$/', (string)$id)) continue;
        $solved[$id] = ['stars' => max(0, min(3, (int)($rec['stars'] ?? 0))), 'time' => max(0, (int)($rec['time'] ?? 0))];
      }
      $users[] = ['name' => $u['name'], 'me' => $u['name'] === $me['name'], 'solved' => (object)$solved];
    }
    out(['ok' => true, 'users' => $users]);
  }
  // Gemeinschaftswerk: Steine werden nur hinzugefügt, nie geändert. Darum gibt es keine Konflikte.
  case 'coop': {
    [$key, $me] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    $id = (string)($in['id'] ?? ''); $n = (int)($in['n'] ?? 0);
    if (!preg_match('/^[a-z0-9_-]{1,32}$/', $id) || $n < 1 || $n > 20000) fail('Unbekanntes Bild.');
    $cells = $in['cells'] ?? [];
    if (!is_array($cells) || count($cells) > 5000) fail('Zu viele Steine auf einmal.');
    if (strlen(json_encode($in)) > 400000) fail('Zu groß.', 413);
    $f = fopen("$dir/coop_$id.php", 'c+');
    if (!$f || !flock($f, LOCK_EX)) fail('Gemeinschaftswerk gerade nicht erreichbar.', 503);
    $raw = stream_get_contents($f);
    $c = $raw ? json_decode(substr($raw, strlen(GUARD)), true) : null;
    if (!is_array($c) || ($c['n'] ?? 0) !== $n) $c = ['n' => $n, 'state' => str_repeat('?', $n), 'ver' => 0, 'by' => [], 'recent' => [], 'seen' => [], 'done' => 0];
    $now = time(); $who = $me['name']; $changed = 0;
    foreach (['miss', 'loss'] as $k) if (!isset($c[$k]) || !is_array($c[$k])) $c[$k] = [];
    // Tropfen: verlorene Tropfen der letzten 2 Stunden
    $loss = array_values(array_filter($c['loss'][$who] ?? [], function ($t) use ($now) { return $now - $t < DROP_BACK; }));
    $miss = max(0, min(DROPS - count($loss), (int)($in['miss'] ?? 0)));
    for ($k = 0; $k < $miss; $k++) { $loss[] = $now; }
    if ($miss) $c['miss'][$who] = ($c['miss'][$who] ?? 0) + $miss;
    $c['loss'][$who] = $loss;
    foreach ($cells as $cv) {
      if (!is_array($cv) || count($cv) < 2) continue;
      $i = (int)$cv[0]; $v = (int)$cv[1];
      if ($i < 0 || $i >= $n || ($v !== 0 && $v !== 1) || $c['state'][$i] !== '?') continue;
      $c['state'][$i] = (string)$v; $changed++;
      $c['by'][$who] = ($c['by'][$who] ?? 0) + 1;
      $c['recent'][] = [$i, $who, $now];
      if (strpos($c['state'], '?') === false) $c['last'] = $who;   // Schlussstein
    }
    if ($changed) { $c['ver']++; $c['recent'] = array_slice($c['recent'], -600); }
    if (!$c['done'] && strpos($c['state'], '?') === false) $c['done'] = $now;
    $c['seen'][$who] = $now;
    ftruncate($f, 0); rewind($f); fwrite($f, GUARD . json_encode($c, JSON_UNESCAPED_UNICODE)); fflush($f);
    flock($f, LOCK_UN); fclose($f);
    $active = []; foreach ($c['seen'] as $nm => $t) if ($nm !== $who && $now - $t < 40) $active[] = $nm;
    $recent = array_values(array_filter($c['recent'], function ($r) use ($now, $who) { return $r[1] !== $who && $now - $r[2] < 30; }));
    out(['ok' => true, 'ver' => $c['ver'], 'state' => ((int)($in['ver'] ?? -1) !== $c['ver'] || $changed) ? $c['state'] : null,
      'recent' => $recent, 'active' => $active, 'by' => (object)$c['by'], 'miss' => (object)$c['miss'], 'last' => $c['last'] ?? '', 'done' => $c['done'],
      'now' => $now, 'loss' => $loss, 'drops' => DROPS, 'back' => DROP_BACK]);
  }
  case 'coop_list': {
    [$key, $me] = findByToken($in['name'] ?? '', $in['token'] ?? '');
    $res = []; $now = time();
    foreach ((array)($in['ids'] ?? []) as $id) {
      if (!is_string($id) || !preg_match('/^[a-z0-9_-]{1,32}$/', $id)) continue;
      $raw = @file_get_contents("$dir/coop_$id.php");
      $c = $raw ? json_decode(substr($raw, strlen(GUARD)), true) : null;
      if (!is_array($c)) { $res[$id] = ['known' => 0, 'total' => 0, 'done' => 0, 'active' => []]; continue; }
      $active = []; foreach (($c['seen'] ?? []) as $nm => $t) if ($now - $t < 40) $active[] = $nm;
      $res[$id] = ['known' => $c['n'] - substr_count($c['state'], '?'), 'total' => $c['n'], 'done' => $c['done'] ?? 0, 'active' => $active, 'by' => (object)($c['by'] ?? []), 'miss' => (object)($c['miss'] ?? []), 'last' => $c['last'] ?? '', 'ver' => $c['ver'] ?? 0,
        'state' => !empty($in['state']) && empty($c['done']) ? $c['state'] : null];
    }
    out(['ok' => true, 'list' => (object)$res]);
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
