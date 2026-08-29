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
