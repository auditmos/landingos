# Informacja o prywatności LandingOS

Wersja: 2026-07-27-v1

LandingOS służy do zaplanowania przejazdu z lotniska BGY do Mediolanu oraz do krótkiej
koordynacji z osobami deklarującymi ten sam lot. Ta informacja opisuje zachowanie
zaimplementowane w aplikacji. Nie jest poradą prawną ani deklaracją zgodności z prawem.

## Jakie dane przetwarza aplikacja

- Adres e-mail służy do logowania jednorazowym kodem. Nie jest pokazywany w pokoju lotu.
- Pseudonim, publiczna deklaracja transportu i treść wiadomości są widoczne dla członków
  tego samego, nadal otwartego pokoju.
- Dokładny cel podróży, identyfikator miejsca i współrzędne pozostają prywatnym kontekstem
  planera. Aplikacja nie zapisuje ich w bazie pokoju, profilach ani analityce.
- Zgoda marketingowa jest dobrowolna, domyślnie wyłączona i zapisywana niezależnie od
  logowania. Można jej nie udzielić lub ją wycofać bez utraty dostępu do planera.
- Analityka korzysta wyłącznie z kontrolowanego rejestru zdarzeń. Dla zalogowanej osoby
  zapisuje nieodwracalny w aplikacji pseudonim HMAC, a nie e-mail ani wewnętrzny identyfikator.

## Udostępnianie i dostawcy

LandingOS nie korzysta z zewnętrznego skryptu analitycznego. W trybie `fixture` dane
dostawców są deterministyczne i lokalne. W trybie `live` niezbędny fragment zapytania
planera może zostać przekazany skonfigurowanemu dostawcy lotów, miejsc lub transportu.
Tryb `live` nigdy nie włącza się automatycznie.

Zakupy, taksówka i nawigacja odbywają się w zewnętrznych serwisach po świadomym otwarciu
dozwolonego linku. LandingOS nie przyjmuje płatności i nie przekazuje tym serwisom historii
pokoju.

## Retencja i usunięcie

Pokój zamyka się dokładnie 24 godziny po planowanym lądowaniu. Od tej chwili nie można
odczytać pokoju, połączyć WebSocketu ani wysłać wiadomości. Treść wiadomości i snapshoty
zgłoszeń są trwale usuwane 30 dni po zamknięciu pokoju.

Usunięcie konta wymaga sesji utworzonej w ostatnich 5 minutach. Operacja usuwa konto,
sesje, e-mail, profil, pseudonim, zgodę marketingową, członkostwa i wybory transportu.
Wiadomości autora otrzymują neutralną treść „Wiadomość usunięta.” i autora „Usunięty
podróżny”. Snapshot istniejącego zgłoszenia zachowuje treść dowodową bez powiązania
z kontem tylko do zwykłego terminu usunięcia pokoju.

Szczegółowe granice zawiera
[macierz retencji i usunięcia konta](./retention-account-deletion.md).

## Ograniczenia operacyjne

Repozytorium usuwa aktywne rekordy aplikacji. Nie steruje czasem przechowywania kopii
zapasowych, logów bezpieczeństwa ani danych dostawców infrastruktury. Te okresy muszą być
sprawdzone w konfiguracji i umowach dostawców przed pilotem produkcyjnym. Dane wcześniej
wyświetlone na innym urządzeniu mogą też pozostać na zrzucie ekranu lub w pamięci urządzenia
poza kontrolą LandingOS.

Status wydania produkcyjnego:
`implementation verified; independent compliance approval pending`.
