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

Im Ordner `knoten/` liegt ein Rätselspiel für iPad und Handy, ebenfalls eine
einzelne Datei ohne Server. Nach dem Einschalten von GitHub Pages liegt es unter
`https://BENUTZERNAME.github.io/REPONAME/knoten/`.

- Perlen sind mit Fäden verbunden und sitzen auf festen Plätzen. Zieht man eine Perle auf eine
  andere, tauschen die beiden die Plätze (oder: erst eine antippen, dann die andere).
  Ziel: kein Faden kreuzt mehr – kupferrot leuchtende Fäden kreuzen sich noch.
- Jeder Tausch kostet einen Zug. Die Punkte oben sind das Zugbudget: goldene Punkte sind das
  Ideal, graue die Reserve. Wer mit dem Ideal löst, bekommt drei Sterne; sind alle Züge
  verbraucht, ist der Knoten verheddert und es geht von vorn los.
- Während des Ziehens wird nichts neu bewertet – erst denken, dann tauschen.
- Jedes Level ist fest und garantiert lösbar: Es entsteht aus einem kreuzungsfreien Netz, in
  dem Perlen in Zweier-, später auch Dreier- und Viererkreisen vertauscht werden. Kein
  einzelner Tausch löst es vorzeitig.
- Die Glühbirne zeigt eine falsch liegende Perle und kostet einen Zug.
- Zwei Finger auf freier Fläche zoomen, doppelt tippen setzt die Ansicht zurück.
- Jeder gelöste Knoten wird zu einem Bleiglasfenster; im Menü liegen alle als Galerie.

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
- 36 Bilder in sechs Welten (10×10 bis 20×20), jede mit eigener Farbstimmung und Tonart.
  Vier gelöste Bilder öffnen die nächste Welt. Sterne ergeben Ränge, gelöste Bilder landen in der Galerie.
- Jedes Rätsel ist eindeutig und ohne Raten lösbar; das prüft der eingebaute Löser beim Bauen.
- Fortschritt wird im Browser gespeichert. Klänge und Musik werden live erzeugt.

`mosaik/index.html` ist erzeugt. Die Quelle liegt in `mosaik/src/` (Bilder in `images.js`),
neu bauen mit `node mosaik/tools/build.js`.
