# V-sport Adatfigyelő

Kísérleti, automatikus adatgyűjtő a Tippmixpro nyilvánosan elérhető **Virtuális BL** kínálatához.

## Mit csinál?

- GitHub Actions segítségével 10 percenként elindul.
- Headless böngészővel megnyitja a nyilvános V-sport oldalt.
- Elmenti az időpontot, az oldal címét, az elért URL-t és a látható szöveges adatokat.
- A legfrissebb minta a `data/latest.json`, az idősor a `data/history.ndjson` fájlba kerül.

## Fontos

Ez az első adatgyűjtő változat. A DOM-szerkezet és a kinyerhető mezők ellenőrzése után pontosítjuk a mérkőzés-, eredmény- és piacfelismerést. A GitHub ütemezett futásai terhelés esetén késhetnek.

Az adatgyűjtés kizárólag nyilvánosan, bejelentkezés nélkül látható oldalról történik.