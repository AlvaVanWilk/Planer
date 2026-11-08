# Planer

Aufgabenliste, die sich selbst sortiert. Läuft vollständig im Browser,
ohne Server und ohne Konto. Alles steckt in `index.html`.

## Auf den Homescreen legen

1. Dieses Repository auf **öffentlich** stellen.
2. **Settings → Pages** → Source: *Deploy from a branch*, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten liegt die Seite unter
   `https://BENUTZERNAME.github.io/REPONAME/`
4. Adresse in Safari öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.

Danach startet der Planer im Vollbild mit eigenem Icon.

## Wie sortiert wird

```
Wert = 6 × Dringlichkeit + (4 − Aufwand) + Wirkungsbonus
Wirkung 3 → +2     Wirkung 2 → 0     Wirkung 1 → −6
```

Dringlichkeit wird aus dem Termin berechnet und wächst hyperbolisch,
je näher er rückt: heute 3,5 — in einer Woche 2,25 — ohne Termin 1.
Überfällig springt sie auf 4, ein Wunschtermin wiegt 55 Prozent.

Weil Dringlichkeit in Sechserschritten springt und alles andere zusammen
höchstens 3 bewegt, stehen dringende Aufgaben grundsätzlich oben.
Wirkung 1 kostet mit −6 genau eine volle Dringlichkeitsstufe.

## Daten

Gespeichert wird im lokalen Speicher des Browsers, getrennt nach Adresse.
Safari räumt Website-Daten auf, wenn eine Seite wochenlang nicht benutzt wird.
Deshalb unten im Planer der Abschnitt **Sicherung**: „Sicherung speichern"
legt eine JSON-Datei ab, „Sicherung laden" spielt sie zurück. Damit lassen
sich die Daten auch auf ein anderes Gerät übertragen.

## Ändern

`index.html` ist erzeugt und enthält React fest eingebaut — dort nicht
von Hand editieren. Die lesbare Quelle ist `planer.jsx`.

---

# Funkel – Diamond Painting

Im Ordner `diamond/` liegt ein kleines Diamond-Painting-Spiel, ebenfalls
eine einzelne Datei ohne Server. Nach dem Einschalten von GitHub Pages liegt es unter
`https://BENUTZERNAME.github.io/REPONAME/diamond/`.

- Unten eine Farbe aus der Ablage wählen, dann auf jedes Feld mit dem passenden Buchstaben tippen.
- Ein Finger verschiebt, zwei Finger zoomen (am Rechner: Mausrad, Tasten `A`–`E`, `+`, `-`, `0`).
- Auf der Leinwand ist nichts vorgefärbt – welches Bild entsteht, sieht man erst beim Legen.
- Der Fortschritt wird im Browser gespeichert.

---

# Knoten – Entwirre die Fäden

Im Ordner `knoten/` liegt ein Knoten-Rätsel für iPad und Handy, ebenfalls eine
einzelne Datei ohne Server. Nach dem Einschalten von GitHub Pages liegt es unter
`https://BENUTZERNAME.github.io/REPONAME/knoten/`.

- Seidenkordeln stecken mit beiden Enden in Messingösen und sind wirklich miteinander
  verknotet: Eine Seilphysik lässt sie umeinander laufen, sich verdrehen und verfangen.
- Ein Ende greifen hebt es an; es lässt sich über alles hinweg in eine freie Öse ziehen,
  die Kordel schleift hinterher. Ziel: Keine Kordel kreuzt mehr eine andere.
- Die Uhr läuft ab dem ersten Griff. Ist noch die halbe Zeit übrig, gibt es drei Sterne,
  bei einem Viertel zwei, sonst einen. Läuft sie ab, beginnt das Level von vorn.
- Wird eine Kordel frei, klingt sie wie eine gezupfte Saite. Beim Lösen wird die ganze
  Harfe von links nach rechts gespielt.
- Rückgängig ist frei; die Glühbirne zeigt eine Kordel, die obenauf liegt (kostet zehn Sekunden).
- Jedes Level ist vorab mit der Seilphysik aus einer kreuzungsfreien Lage verknotet worden
  und zählt nur, wenn es sich rückwärts gespielt wieder vollständig löst.

`knoten/index.html` ist erzeugt. Die Quelle liegt in `knoten/src/` (Seilphysik in `rope.js`),
neu bauen mit `node knoten/tools/build.js`. Die Level erzeugt `node knoten/tools/levels.js 60`
(dauert einige Minuten).

---

# Mosaik – Zahlen, die Bilder verraten

Im Ordner `mosaik/` liegt ein Mosaik-Rätsel (Fill-a-Pix) für iPad und Handy, ebenfalls
eine einzelne Datei ohne Server. Nach dem Einschalten von GitHub Pages liegt es unter
`https://BENUTZERNAME.github.io/REPONAME/mosaik/`.

- Jede Zahl sagt, wie viele Felder in ihrem 3×3-Block (sie selbst eingeschlossen) zum Bild gehören.
- Unten zwischen **Füllen** und **Leer** wählen, dann tippen oder mit dem Finger über Felder ziehen.
  Eine Zahl **gedrückt halten** legt ihren Block, sobald er feststeht. Die Glühbirne zeigt den nächsten Schluss.
- **Farbenzauber** (Standard): Jeder richtige Stein leuchtet sofort in seiner Farbe auf, Fehler werden
  korrigiert und kosten Sterne. **Klassisch**: wie in der Zeitschrift, Farben erst am Ende; zwei Finger
  tippen macht den letzten Zug rückgängig.
- 48 Bilder in acht Welten (10×10 bis 22×22), dazu die Sonderreihe **Panoramen**: 6 Landschaften im Breitformat 24×16, von Anfang an offen, jede mit eigener Farbstimmung und Tonart.
  Vier gelöste Bilder öffnen die nächste Welt. Sterne ergeben Ränge, gelöste Bilder landen in der Galerie.
- Jedes Rätsel ist eindeutig und ohne Raten lösbar; das prüft der eingebaute Löser beim Bauen.
- Fortschritt wird im Browser gespeichert. Klänge und Musik werden live erzeugt.

### Mosaik auf dem eigenen Webspace, mit Konten für die Familie

Mit Konten hat jede Person ihren eigenen Fortschritt, gesichert auf dem Webspace und auf jedem
Gerät verfügbar. Dafür braucht der Webspace PHP (ab 7.4; bei IONOS-Webhosting dabei).

1. Diese drei Dateien aus `mosaik/` in einen Ordner auf dem Webspace hochladen, zum Beispiel
   `mosaik/`: `index.html`, `icon.png`, `api.php`.
2. **`api.php` auf dem Webspace** öffnen (im Dateimanager von IONOS oder per FTP) und in der Zeile
   `const FAMILY_CODE = 'BITTE-AENDERN';` einen eigenen Familiencode eintragen, zum Beispiel
   `const FAMILY_CODE = 'Sonnenblume42';`. Diesen Code **nicht** hier im Repository eintragen,
   denn das Repository ist öffentlich.
3. Die Seite im Browser öffnen, `https://deine-domain.de/mosaik/`. Beim Start erscheint die
   Anmeldung. Unter „Neues Konto“ Name, Passwort und Familiencode eingeben.
4. Den Familiencode an die Familie weitergeben. Danach kann jede Person ihr eigenes Konto anlegen.

Mit Konten gibt es zu jedem Mosaik eine **Bestenliste der Familie**: auf der Karte nach dem
Lösen und in der Galerie beim Antippen eines Bildes. Gewertet wird zuerst nach Sternen, dann
nach Zeit. Die Zeit läuft während des Spiels unsichtbar mit, damit niemand gegen die Uhr hetzt.

Auf der Startseite führt **Bestenliste** zu einer Gesamtwertung der Familie nach Punkten und zu
den Bestzeiten jedes Bildes, sortiert nach Welten. Punkte je Bild: so viele wie das Bild Felder hat
(100 bei 10×10, 400 bei 20×20), mit 3/2/1 Sternen 100/70/40 % davon, dazu bis zu 30 % Tempo-Bonus,
wenn man schneller ist als 1,5 Sekunden pro Feld. Es zählt das beste Ergebnis je Bild.

**Gemeinschaftswerke**: riesige Szenen (72×48, fast 3.500 Felder), an denen die ganze Familie
gleichzeitig legt – jederzeit, ohne Warten. Es bleiben nur Steine liegen, die stimmen, darum kann
sich niemand in die Quere kommen. Was andere legen, erscheint nach ein paar Sekunden mit ihrem
Namen. Zwei Finger schieben und zoomen, die kleine Karte zeigt das ganze Bild. Ein Fehler kostet
einen Tropfen (alle 20 Sekunden kommt einer zurück). Ist ein Werk fertig, sehen alle die
Enthüllung mit der Liste, wer wie viele Steine gelegt hat, und das nächste Werk öffnet sich.
Der gemeinsame Stand liegt in `mosaik-daten/coop_*.php`. Ohne Webspace legt man allein.

Beim ersten Aufruf legt `api.php` daneben den Ordner `mosaik-daten/` an. Darin liegt je Konto
eine Datei. Passwörter sind nur als Hash gespeichert, die Dateien sind über den Browser nicht
abrufbar. Nach 8 falschen Passwörtern ist ein Konto für 5 Minuten gesperrt; höchstens 30 Konten.
Zum Sichern genügt es, den Ordner `mosaik-daten/` herunterzuladen. Ein Konto löschen heißt,
seine Datei dort zu löschen.

Ohne PHP (zum Beispiel auf GitHub Pages) läuft Mosaik wie bisher ohne Anmeldung, der
Fortschritt liegt dann nur im Browser.

`mosaik/index.html` ist erzeugt. Die Quelle liegt in `mosaik/src/` (Bilder in `images.js`),
neu bauen mit `node mosaik/tools/build.js`.
