# LandingOS MVP — Polska → Mediolan-Bergamo (BGY)

> Źródło dyskusji i indeks dostawy: [GitHub issue #1](https://github.com/auditmos/landingos/issues/1).

## Problem Statement

Samotny, budżetowy podróżny lecący z Polski do Włoch często ląduje na nieznanym lotnisku oddalonym od właściwego celu podróży. Po wylądowaniu musi samodzielnie połączyć informacje o locie, lokalnym transporcie, cenach, przesiadkach, zakupie biletów i drodze do noclegu. Informacje są rozproszone pomiędzy stronami lotnisk, przewoźników i aplikacjami mapowymi, a część z nich jest niepełna albo trudna do porównania.

Osoby lecące tym samym samolotem nie mają również prostego sposobu, aby porozumieć się jeszcze przed podróżą, wybrać wspólny transport po wylądowaniu albo podzielić koszt taksówki. Problem jest szczególnie odczuwalny przez solo travelerów i backpackerów, którzy nie wynajmują samochodu i chcą ograniczyć koszt, stres oraz ryzyko utknięcia na lotnisku.

Pierwszym korytarzem obsługiwanym przez MVP są bezpośrednie loty z Polski na lotnisko Mediolan-Bergamo (BGY), a pierwszym obszarem docelowym jest dowolny adres w Mediolanie.

## Solution

LandingOS będzie mobilną aplikacją webową/PWA, w której podróżny:

1. podaje numer lotu i datę;
2. otrzymuje rozpoznane lotnisko oraz planowaną godzinę przylotu;
3. wskazuje miejsce noclegu lub inny cel w Mediolanie;
4. otrzymuje maksymalnie trzy czytelne warianty przejazdu: rekomendowany, najszybszy i najprostszy;
5. wybiera wariant, sprawdza jego kroki, cenę lub informację o braku pełnej ceny oraz przechodzi do zewnętrznego zakupu biletu;
6. loguje się kodem wysłanym e-mailem i dołącza do jednego tymczasowego pokoju przypisanego do konkretnego lotu i daty;
7. widzi pseudonimy oraz wybory transportowe innych pasażerów;
8. rozmawia na wspólnym czacie i koordynuje wspólny transport publiczny albo dzieloną taksówkę.

Podstawowy planer pozostaje użyteczny, gdy w pokoju nie ma innych osób. MVP nie sprzedaje biletów, nie przyjmuje płatności i nie potwierdza posiadania karty pokładowej.

## User Stories

1. **US-01:** Jako podróżny chcę podać numer lotu i datę, abym nie musiał sam wyszukiwać lotniska oraz godziny przylotu.
2. **US-02:** Jako podróżny chcę zobaczyć rozpoznany lot, lotnisko docelowe i planowaną godzinę przylotu, abym mógł potwierdzić, że aplikacja znalazła właściwą podróż.
3. **US-03:** Jako podróżny chcę ręcznie wybrać lotnisko i godzinę, gdy dostawca nie rozpozna numeru lotu, abym nadal mógł skorzystać z planera.
4. **US-04:** Jako podróżny chcę wyszukać i jednoznacznie wybrać adres lub miejsce docelowe w Mediolanie, abym otrzymał trasę do właściwego celu.
5. **US-05:** Jako podróżny chcę zmienić domyślny 45-minutowy bufor po planowanym lądowaniu, abym mógł uwzględnić bagaż i własne tempo opuszczania lotniska.
6. **US-06:** Jako podróżny chcę zobaczyć wariant rekomendowany, najszybszy i najprostszy, abym mógł szybko wybrać przejazd zgodny z moimi priorytetami.
7. **US-07:** Jako podróżny chcę dla każdego wariantu zobaczyć czas, dostępny koszt, liczbę przesiadek, odcinki piesze i kolejne kroki, abym rozumiał przebieg podróży.
8. **US-08:** Jako podróżny chcę wiedzieć, kiedy cena lub rozkład są niepełne, szacowane albo ręcznie utrzymywane, abym nie traktował niepewnej informacji jak gwarancji.
9. **US-09:** Jako podróżny chcę wybrać jeden wariant transportu, abym mógł zapisać swój zamiar i pokazać go innym osobom z lotu.
10. **US-10:** Jako podróżny chcę przejść do strony przewoźnika lub zewnętrznej nawigacji, abym mógł kupić bilet albo kontynuować podróż bez płatności w LandingOS.
11. **US-11:** Jako podróżny chcę otrzymać jasny komunikat i bezpieczne alternatywy, gdy nie ma wiarygodnej trasy, abym nie otrzymał zmyślonej rekomendacji.
12. **US-12:** Jako podróżny chcę zalogować się kodem jednorazowym wysłanym na e-mail, abym mógł wejść do pokoju lotu bez tworzenia hasła.
13. **US-13:** Jako podróżny chcę ustawić prosty pseudonim, abym nie musiał ujawniać pełnej tożsamości innym pasażerom.
14. **US-14:** Jako podróżny chcę automatycznie trafić do jednego pokoju odpowiadającego mojemu numerowi lotu i dacie, abym rozmawiał z właściwą grupą.
15. **US-15:** Jako uczestnik pokoju chcę widzieć pseudonimy i wybrany transport innych osób, abym mógł znaleźć współpasażerów o podobnym planie.
16. **US-16:** Jako uczestnik pokoju chcę wysyłać i odbierać wiadomości na jednym wspólnym czacie, abym mógł ustalić spotkanie i wspólny przejazd.
17. **US-17:** Jako uczestnik pokoju chcę móc zadeklarować wspólny transport publiczny albo dzieloną taksówkę, abym mógł podróżować z innymi bez rozliczania pieniędzy w aplikacji.
18. **US-18:** Jako podróżny chcę, aby mój dokładny adres docelowy pozostawał niewidoczny dla innych uczestników, abym nie ujawniał miejsca noclegu.
19. **US-19:** Jako podróżny chcę zmienić wybrany wariant transportu, abym mógł zareagować na zmianę planu przed wylądowaniem.
20. **US-20:** Jako uczestnik pokoju chcę zablokować inną osobę, abym nie widział jej wiadomości i nie otrzymywał od niej dalszych interakcji.
21. **US-21:** Jako uczestnik pokoju chcę zgłosić użytkownika lub wiadomość, abym mógł powiadomić operatora o nadużyciu.
22. **US-22:** Jako podróżny chcę mieć dostęp do pokoju od momentu dodania lotu do 24 godzin po planowanym lądowaniu, abym mógł koordynować podróż przed i bezpośrednio po przylocie.
23. **US-23:** Jako podróżny chcę, aby zamknięty pokój zniknął z aplikacji, a wiadomości zostały usunięte po 30 dniach, abym nie pozostawiał bezterminowej historii podróży.
24. **US-24:** Jako jedyny użytkownik danego lotu chcę nadal otrzymać komplet rekomendacji transportowych, abym nie był zależny od efektu sieciowego.
25. **US-25:** Jako podróżny korzystający z telefonu chcę przejść całą ścieżkę w responsywnej PWA, abym nie musiał instalować natywnej aplikacji.
26. **US-26:** Jako operator produktu chcę utrzymywać zweryfikowany katalog transferów BGY wraz ze źródłem, datą kontroli, ceną i linkiem zakupu, aby uzupełniać braki zewnętrznego routingu.
26a. **US-26a:** Jako operator produktu chcę samodzielnie dodawać i edytować wpisy katalogu transferów w uwierzytelnionym panelu administracyjnym, abym mógł utrzymywać brakujące shuttle busy i ceny bez udziału zespołu developerskiego.
27. **US-27:** Jako właściciel produktu chcę mierzyć rozpoznanie lotu, wygenerowanie trasy, wybór transportu, wejście do pokoju i aktywność czatu, abym mógł ocenić użyteczność oraz efekt społecznościowy MVP.
28. **US-28:** Jako podróżny chcę otrzymać kontrolowany komunikat i możliwość ponowienia albo ręcznego przejścia dalej podczas awarii zewnętrznego dostawcy, abym nie utknął na niedziałającym ekranie.
29. **US-29:** Jako użytkownik chcę móc zażądać usunięcia konta i powiązanych danych osobowych, abym zachował kontrolę nad swoimi danymi.
30. **US-30:** Jako użytkownik pokoju chcę przed pierwszą wiadomością zaakceptować krótkie zasady społeczności, abym znał reguły kontaktu i zgłaszania nadużyć.
31. **US-31:** Jako podróżny chcę, aby wyszukiwanie celu było ograniczone do obszaru Mediolanu, a wybór punktu poza wspieranym zakresem kończył się jasnym komunikatem „cel jeszcze nieobsługiwany”, abym nie otrzymał trasy dla lokalizacji spoza korytarza MVP.
32. **US-32:** Jako użytkownik chcę osobno i dobrowolnie wyrazić zgodę, zanim mój e-mail zostanie użyty do celów marketingowych lub jako lead, aby logowanie kodem nie oznaczało automatycznej zgody na komunikację marketingową.

## Implementation Decisions

### AFK delivery and production release gates

- Issues #2–#12 form a fully AFK implementation queue: code, fixtures, migrations, tests, and documentation can be completed without waiting for a human response.
- When live provider credentials are unavailable, development and CI use explicit deterministic fixture adapters behind the same contracts. Fixture mode is forbidden in staging and production.
- Two external prerequisites gate only a real production pilot, not implementation-issue completion: (1) live provider measurement plus commercial/licensing acceptance and (2) independent privacy/compliance approval. Neither may be silently claimed by an agent.
- Production readiness fails closed until both prerequisites are recorded; local implementation, tests, and issue closure continue unattended.

### Scope and platform

- Pierwszy korytarz to dowolny bezpośredni lot z Polski do Mediolan-Bergamo (BGY).
- Pierwszy zakres miejsca docelowego to dowolny adres lub miejsce w Mediolanie.
- Aplikacja powstaje jako responsywna aplikacja webowa/PWA w istniejącym monorepo.
- Istniejący stos projektu pozostaje granicą technologiczną: TanStack Start, Hono na Cloudflare Workers, Better Auth oraz współdzielona warstwa danych oparta o Drizzle/Postgres.
- Architektura jest hybrydowa: trudne dane zewnętrzne pochodzą od wyspecjalizowanych dostawców, natomiast dane użytkowników, pokoje, wiadomości i katalog transferów pozostają w warstwie kontrolowanej przez LandingOS.
- Natywna aplikacja mobilna jest odłożona, ale nie wykluczona. Aby przyszły klient natywny (iOS/Android) mógł korzystać z tego samego backendu bez przebudowy, granica API pozostaje niezależna od klienta: żadna kluczowa logika nie zakłada wyłącznie sesji przeglądarki, logowanie kodem e-mail wydaje token nadający się do użycia również przez klienta natywnego, a transport dostarczania wiadomości w pokoju (WebSocket/SSE) musi być osiągalny spoza przeglądarki. Panel administracyjny jest cienką nakładką na to samo API.

### Deep modules

1. **Flight Context Resolver**
   - Stabilny interfejs przyjmuje numer lotu i datę.
   - Zwraca kanoniczny kontekst lotu: przewoźnik, numer, data, lotnisko początkowe, BGY, planowana godzina przylotu i strefa czasowa.
   - Dostawca danych lotniczych jest ukryty za adapterem; pierwszym kandydatem jest Aviationstack lub równoważny komercyjny provider.
   - Brak rozpoznania nie blokuje planera: moduł zwraca jawny stan wymagający ręcznego wyboru lotniska i czasu.
   - MVP nie śledzi lotu na żywo i nie aktualizuje opóźnień.

2. **Journey Recommendation Engine**
   - Stabilny interfejs przyjmuje kontekst przylotu, cel oraz bufor po lądowaniu.
   - Zwraca znormalizowane warianty transportu niezależnie od źródła.
   - Pierwszy adapter routingu wykorzystuje Google Routes, a wybór celu Google Places lub równoważne API.
   - Wyniki zewnętrzne są łączone z ręcznie utrzymywanym katalogiem transferów BGY.
   - Ranking jest deterministyczny i tworzy etykiety: rekomendowany, najszybszy i najprostszy. „Najtańszy” nie jest obietnicą MVP, ponieważ kompletność taryf nie jest gwarantowana.
   - Każda cena i informacja ręczna posiada źródło oraz datę ostatniej weryfikacji.
   - Brak wiarygodnego wyniku jest prawidłowym wynikiem domenowym, a nie powodem do generowania zastępczej rekomendacji.
   - Ograniczenie do Mediolanu jest miękkie, ale jawne: autouzupełnianie celu jest zawężone/biasowane do obszaru administracyjnego Mediolanu, a wybór punktu poza wspieranym zakresem nie uruchamia routingu i zwraca kontrolowany stan „cel jeszcze nieobsługiwany” (ten sam wzorzec co brak wiarygodnej trasy). Granica jest parametrem konfiguracyjnym, aby można ją było rozszerzyć na kolejne miasta bez zmiany interfejsu.

3. **Flight Room**
   - Jeden pokój jest identyfikowany przez kanoniczną instancję lotu, a nie sam tekst wpisany przez użytkownika.
   - Pokój zawiera członkostwa, pseudonimy, bieżący wybór transportu i jeden wspólny strumień wiadomości.
   - Nie powstają podgrupy, wiadomości prywatne ani trwałe profile społecznościowe.
   - Dokładny cel podróży pozostaje w prywatnym kontekście planera i nie jest zwracany przez interfejs pokoju. Jedyny wyjątek (decyzja z 2026-08-05): podróżny może dobrowolnie udostępnić tekstowy „punkt wysiadki” (`dropOffText`, do 120 znaków) w ramach własnej deklaracji transportu — domyślnie ukryty, odwoływalny w każdej chwili. Place ID i współrzędne nigdy nie trafiają do pokoju.
   - Pokój otwiera się po pierwszym dodaniu lotu i staje się niedostępny 24 godziny po planowanym lądowaniu.
   - Wiadomości pozostają niedostępne dla użytkowników po zamknięciu pokoju i są trwale usuwane 30 dni później.
   - Mechanizm dostarczania wiadomości jest szczegółem modułu; musi spełnić kryteria widoczności, izolacji i opóźnienia z Validation Strategy.

4. **Identity & Safety**
   - Better Auth z pluginami Email OTP i Bearer obsługuje logowanie kodem e-mail oraz sesje przeglądarkowe i tokeny klientów natywnych.
   - Publiczna reprezentacja użytkownika zawiera tylko pseudonim i wybrany transport.
   - Wejście do pokoju nie wymaga przesłania karty pokładowej; jest to jawne ograniczenie zaufania w MVP.
   - Blokowanie działa na poziomie egzekwowanym przez serwer.
   - Zgłoszenie zachowuje niezbędny kontekst wiadomości w ramach 30-dniowego okresu retencji.
   - Przed pierwszym wysłaniem wiadomości użytkownik akceptuje zasady społeczności.
   - Istnieje wyodrębniona rola operatora/administratora, egzekwowana po stronie serwera, uprawniająca wyłącznie do panelu administracyjnego, a nie do prywatnych danych planera użytkowników.
   - Zgoda marketingowa na użycie e-maila jako leada jest odrębna od logowania i domyślnie wyłączona.

5. **Operator Console**
   - Uwierzytelniony panel administracyjny udostępnia operacje CRUD na katalogu transferów BGY (operator, źródło, data kontroli, zakres ceny, link zakupu).
   - Panel jest cienką nakładką na to samo API co reszta produktu, dostępną wyłącznie dla roli operatora.
   - Wpis bez wymaganych pól nie może zostać opublikowany; walidacja świeżości oznacza wpisy wymagające ponownej weryfikacji.
   - Panel udostępnia kolejkę otwartych zgłoszeń bezpieczeństwa w trybie tylko do odczytu (`GET /operator/reports`), za tą samą serwerową kontrolą roli operatora co katalog. Widoczne są wyłącznie: pseudonimy zgłaszającego i zgłoszonego, powód, notatka, kontekst lotu (oznaczenie + data) oraz zamrożony snapshot zgłoszonej wiadomości. Zgłoszenia usuniętych kont pozostają w kolejce z pustymi pseudonimami; snapshot znika po upływie retencji.
   - Panel nie ma dostępu do dokładnych celów podróży, adresów e-mail ani do pozostałej treści prywatnych czatów. Zapis zgłoszeń oraz blokowanie pozostają po stronie modułu Identity & Safety.
   - **Nie zaimplementowano:** zmiany statusu zgłoszenia. Enum `safety_report_status` ma nadal jedną wartość (`open`), więc kolejka jest przeglądem, a nie workflow — zamykanie/eskalacja wymagają migracji oraz przeglądu zgodności.

### Data flow and integrations

- Normalna ścieżka: numer lotu + data → Flight Context Resolver → cel + bufor → Journey Recommendation Engine → wybór wariantu → logowanie → Flight Room.
- Planer działa przed logowaniem; logowanie jest wymagane dopiero przy wejściu do pokoju.
- Zakup biletu, zamówienie taksówki i nawigacja odbywają się przez jawne linki zewnętrzne.
- LandingOS nie przetwarza płatności, nie dzieli kosztów i nie jest stroną umowy przewozu.
- Integracje zewnętrzne muszą mieć limity czasu, kontrolowane błędy i adaptery umożliwiające wymianę providera.
- Przed aktywacją live providera w pilocie produkcyjnym wykonywany jest spike danych obejmujący reprezentatywne loty i cele. Implementacja oraz CI mogą wcześniej korzystać wyłącznie z jawnych, deterministycznych adapterów fixture za tym samym kontraktem. Spike mierzy pokrycie, jakość odpowiedzi, liczbę wywołań, opóźnienie oraz koszt pełnego scenariusza; brak pomiaru blokuje produkcyjną aktywację providera, ale nie blokuje pracy nad kodem.

### Privacy and lifecycle

- Dokładny adres celu jest danymi prywatnymi planera i nie może znaleźć się w odpowiedzi pokoju, wydarzeniach analitycznych ani wiadomości systemowej. Jedyny wyjątek to świadomie udostępniony przez podróżnego tekstowy punkt wysiadki (`dropOffText`) w jego własnej deklaracji — domyślnie ukryty i odwoływalny; place ID i współrzędne pozostają objęte zakazem bez wyjątków.
- Dane pokoju są izolowane pomiędzy różnymi instancjami lotów, w tym lotami o tym samym numerze w różnych dniach.
- Pokój jest ukrywany 24 godziny po planowanym lądowaniu; wiadomości są usuwane po kolejnych 30 dniach.
- Polityka usunięcia konta oraz ewentualne wyjątki dla otwartych zgłoszeń wymagają przeglądu zgodności przed uruchomieniem produkcyjnym.
- E-mail jest pozyskiwany wyłącznie do logowania kodem. Ponieważ podstawową wartością biznesową MVP (przy wyłączonych płatnościach) są leady do bazy i retencja, każde użycie e-maila jako leada lub do komunikacji marketingowej wymaga odrębnej, dobrowolnej zgody (opt-in) i musi być zgodne z polityką prywatności oraz prawem do usunięcia danych (US-29).

## Assumptions

1. Lotnisko Mediolan-Bergamo pozostanie obsługiwane przez bezpośrednie loty z co najmniej części polskich lotnisk w okresie pilotażu.
2. Numer lotu i data są łatwo dostępne dla użytkownika oraz wystarczają do rozpoznania właściwej instancji lotu po uwzględnieniu codeshare i stref czasowych.
3. Planowana godzina przylotu jest wystarczająca dla MVP; brak informacji o opóźnieniu nie przekreśla wartości rekomendacji.
4. Zewnętrzny dostawca danych lotniczych oferuje licencję pozwalającą na komercyjne użycie wymaganych danych.
5. Google Routes/Places lub równoważny provider posiada wystarczające pokrycie BGY i Mediolanu, aby osiągnąć próg 9/10 reprezentatywnych przypadków.
6. Brakujące shuttle busy i ceny można utrzymywać ręcznie dla jednego lotniska bez nieakceptowalnego obciążenia operacyjnego, a operator produktu utrzymuje je samodzielnie w panelu administracyjnym (potwierdzone przez klienta).
7. Użytkownicy zaakceptują logowanie kodem e-mail przed wejściem do pokoju.
8. Jeden wspólny czat lotu będzie wystarczający podczas pierwszego pilotażu i nie stanie się nieczytelny przy początkowej skali.
9. Brak innych osób w pokoju nie obniża wartości planera transportowego.
10. Pseudonim, blokowanie, zgłaszanie i zasady społeczności zapewniają minimalny akceptowalny poziom bezpieczeństwa pilotażu.
11. Dopuszczenie do pokoju na podstawie lotu i zalogowanego e-maila, bez potwierdzenia karty pokładowej, jest akceptowalnym ryzykiem MVP.
12. Użytkownicy nie będą oczekiwać, że LandingOS gwarantuje wspólny przejazd, tożsamość innych osób, cenę lub bezpieczeństwo taksówki.
13. Operator może przechowywać wiadomości przez 30 dni po zamknięciu pokoju na potrzeby obsługi zgłoszeń, pod warunkiem przeprowadzenia przeglądu zgodności i opublikowania odpowiedniej informacji dla użytkowników.
14. Istniejący stos Cloudflare/Postgres jest wystarczający dla pilotażu; wymagania dotyczące większej skali i formalnego SLA zostaną ustalone na podstawie pomiarów.
15. Użytkownik ma połączenie z internetem podczas korzystania z planera i czatu; tryb offline nie jest częścią MVP.
16. W MVP interfejs i treści są kierowane do polskojęzycznego użytkownika, natomiast dane lokalne mogą zawierać włoskie nazwy własne.
17. Rzeczywista retencja przy kolejnej podróży będzie możliwa do oceny dopiero po wystąpieniu kolejnych podróży tych samych użytkowników; wcześniejsze deklaracje są wyłącznie wskaźnikiem zastępczym.

## Tradeoffs Considered

- **Obsługa wszystkich lotnisk we Włoszech** — odrzucona dla MVP, ponieważ zwielokrotnia integracje, ręczną weryfikację i ryzyko niespójnych danych.
- **Rzym-Ciampino jako równoległy pierwszy rynek** — odrzucony, aby pierwszy spike i katalog transferów dotyczyły tylko jednego lotniska.
- **Architektura managed-first dla całego systemu** — odrzucona ze względu na większy lock-in dla danych użytkowników i funkcji społecznościowych.
- **Architektura w pełni self-hosted z OpenTripPlanner, GTFS i OSM** — odrzucona dla MVP ze względu na koszt operacyjny zbierania feedów, hostowania routingu i uzupełniania transferów lotniskowych.
- **Śledzenie lotu na żywo** — odrzucone, ponieważ planowana godzina wystarcza do weryfikacji głównej wartości, a live status zwiększa koszt oraz liczbę stanów awaryjnych.
- **Opcja „najtańsza”** — odrzucona jako gwarantowana etykieta, ponieważ zewnętrzne API nie zapewnia pełnych taryf dla każdego etapu.
- **Zakup biletów i płatności w LandingOS** — odrzucone, ponieważ rozszerzają zakres o obsługę transakcji, zwrotów i odpowiedzialności.
- **Podgrupy według wybranego transportu** — odrzucone na rzecz jednego czatu lotu zgodnie z decyzją produktową.
- **Wiadomości prywatne** — odrzucone, ponieważ zwiększają ryzyko nadużyć i zakres moderacji bez konieczności dla podstawowego scenariusza.
- **Weryfikacja karty pokładowej** — odrzucona, ponieważ przetwarzanie dokumentu i dodatkowy krok wejścia są nieproporcjonalne do pilotażu.
- **Natychmiastowe usuwanie wiadomości po zamknięciu pokoju** — odrzucone, ponieważ uniemożliwiłoby obsługę zgłoszeń złożonych pod koniec podróży.
- **Bezterminowa historia czatu** — odrzucona, ponieważ jest zbędna po podróży i zwiększa ryzyko prywatności.
- **Natywne aplikacje iOS i Android** — odłożone (nie wykluczone) na rzecz jednej PWA w MVP, aby ograniczyć liczbę powierzchni wdrożeniowych. Ponieważ natywny klient jest planowany w przyszłości, granica API pozostaje niezależna od klienta (patrz Scope and platform), aby dodać go później bez przebudowy backendu.
- **Dokładny adres widoczny w pokoju** — odrzucony ze względów bezpieczeństwa i prywatności. Decyzja z 2026-08-05: dopuszczono wyłącznie dobrowolny, domyślnie ukryty tekstowy punkt wysiadki udostępniany świadomie przez podróżnego (bez place ID i współrzędnych); automatyczna widoczność adresu pozostaje odrzucona.

## Validation Strategy

### Story-level validation

| Story | Mechanizm weryfikacji | Kryterium zaliczenia |
|---|---|---|
| US-01 | Test formularza: poprawny numer i data, brak daty, nieprawidłowy format | Poprawne dane uruchamiają resolver; niepoprawne nie wywołują providera i pokazują błąd pola |
| US-02 | Test kontraktowy resolvera na fixture oraz sandboxie dostawcy | UI pokazuje przewoźnika, numer, BGY i planowany czas w lokalnej strefie; co najmniej 9/10 reprezentatywnych lotów jest rozpoznanych |
| US-03 | Test błędu `not_found`, timeoutu i odpowiedzi niepełnej | Każdy przypadek oferuje ręczny wybór BGY i godziny bez utraty wpisanego celu |
| US-04 | Test autocomplete dla adresu, hotelu i nazwy miejsca oraz dwóch nazw niejednoznacznych | Użytkownik wybiera jednoznaczny wynik z identyfikatorem i współrzędnymi; brak cichego wyboru pierwszego dopasowania |
| US-05 | Test zegara i obliczania czasu startu trasy | Domyślnie używane jest +45 minut; zmiana bufora przelicza zapytanie i wynik |
| US-06 | Integracyjny test 10 kombinacji lot/cel/godzina porównany z oficjalnymi źródłami | Co najmniej 9/10 przypadków ma prawidłowy użyteczny wynik; etykiety nie duplikują tej samej trasy bez wyjaśnienia |
| US-07 | Test schematu i renderowania szczegółów każdego rodzaju odcinka | Każdy wariant pokazuje czas, znany koszt lub brak ceny, przesiadki, marsz i kroki w prawidłowej kolejności |
| US-08 | Fixture z pełną ceną, częściową ceną, ręcznym wpisem i starym wpisem | UI zawsze pokazuje status kompletności, źródło oraz datę weryfikacji danych ręcznych |
| US-09 | Test zapisu i ponownego odczytu wyboru | Po odświeżeniu aktywny jest ostatni wybór użytkownika i jest powiązany z właściwą instancją lotu |
| US-10 | Test allowlisty oraz formatów linków | Link prowadzi wyłącznie do zatwierdzonego operatora lub nawigacji i nigdy nie inicjuje płatności w LandingOS |
| US-11 | Test zerowych wyników, wyników po czasie przylotu i danych niekompletnych | Aplikacja nie generuje trasy; pokazuje kontrolowany komunikat, źródła alternatywne i możliwość zmiany parametrów |
| US-12 | Integracyjny test OTP: poprawny kod, błędny kod, kod wygasły i limit prób | Tylko poprawny, niewygasły kod tworzy sesję; próby są ograniczone i nie ujawniają istnienia konta |
| US-13 | Test długości, niedozwolonych znaków i pustego pseudonimu | Do pokoju trafia wyłącznie pseudonim spełniający reguły; e-mail nie jest publiczny |
| US-14 | Test dwóch użytkowników tego samego lotu oraz lotów o tym samym numerze w dwóch dniach | Pierwsza para trafia do jednego pokoju; druga para jest całkowicie odizolowana |
| US-15 | Test odpowiedzi listy członków | Odpowiedź zawiera pseudonim i wybór transportu, ale nie zawiera e-maila ani dokładnego celu |
| US-16 | Test dwóch równoległych klientów wysyłających i odbierających wiadomości | Wiadomość pojawia się u drugiego klienta w ciągu 5 sekund, bez duplikatów i bez przecieku do innego pokoju |
| US-17 | Test deklaracji transportu publicznego i dzielonej taksówki | Obie deklaracje są widoczne; w żadnej ścieżce nie istnieje formularz płatności ani automatyczne rozliczenie |
| US-18 | Test kontraktowy API oraz skan payloadów/analityki | Dokładny adres, place ID i współrzędne celu nie pojawiają się w API pokoju, wiadomościach systemowych ani zdarzeniach analitycznych; jedyny dopuszczony wyjątek to jawnie udostępniony przez podróżnego tekst punktu wysiadki w jego własnej deklaracji |
| US-19 | Test zmiany wyboru przy dwóch aktywnych klientach | Nowy wybór zastępuje poprzedni i jest widoczny dla drugiego klienta w ciągu 5 sekund |
| US-20 | Test blokady po stronie serwera | Po blokadzie wiadomości blokowanej osoby nie są zwracane blokującemu; odświeżenie i nowa sesja nie obchodzą blokady |
| US-21 | Test zgłoszenia użytkownika i konkretnej wiadomości | Powstaje zgłoszenie z identyfikatorem pokoju, zgłaszającym, celem, czasem i niezbędnym snapshotem; brak danych dokładnego celu podróży |
| US-22 | Test z kontrolowanym zegarem przed przylotem, +23:59 i +24:00 | Pokój jest dostępny przed granicą i niedostępny od 24 godzin po planowanym lądowaniu |
| US-23 | Test retencji z kontrolowanym zegarem | Po zamknięciu pokój znika z interfejsu; 30 dni później wiadomości i ich treść nie istnieją w aktywnym magazynie |
| US-24 | Test lotu z jednym członkiem i pustym pokojem | Planer zwraca te same rekomendacje niezależnie od liczby członków pokoju |
| US-25 | Test E2E kluczowej ścieżki w mobilnym i desktopowym viewporcie oraz instalowalności manifestu | Formularze, wyniki i czat są używalne bez poziomego przewijania; PWA ma poprawny manifest |
| US-26 | Test CRUD katalogu i walidacji świeżości | Każdy aktywny wpis ma operatora, źródło, datę kontroli, zakres ceny i link; wpis bez wymaganych pól nie może być opublikowany |
| US-26a | Test dostępu do panelu administracyjnego i operacji CRUD przez rolę operatora oraz próby dostępu przez zwykłego użytkownika | Operator wykonuje pełny CRUD katalogu w panelu; użytkownik bez roli operatora otrzymuje odmowę egzekwowaną po stronie serwera; panel nie ujawnia dokładnych celów ani treści czatów |
| US-27 | Test zdarzeń analitycznych na pełnej ścieżce i ścieżce porzuconej | Każde zdarzenie pojawia się dokładnie raz, używa pseudonimowego ID i nie zawiera e-maila, adresu ani treści wiadomości |
| US-28 | Test fault injection: timeout, 429, 500 i nieprawidłowa odpowiedź każdego providera | UI kończy stan ładowania, pokazuje kontrolowany błąd i umożliwia ponowienie lub ręczny fallback |
| US-29 | Test usunięcia użytkownika z danymi prywatnymi, wyborem i wiadomościami | Dane profilu i prywatnego celu są usunięte; zachowanie zgłoszonych treści jest zgodne z zatwierdzoną polityką retencji |
| US-30 | Test pierwszej i kolejnej wiadomości | Pierwsza wiadomość wymaga zaakceptowania aktualnej wersji zasad; po akceptacji kolejne nie pytają ponownie do zmiany wersji |
| US-31 | Test autouzupełniania celu w granicach Mediolanu oraz wyboru punktu poza zakresem | Wyniki autouzupełniania są ograniczone do obszaru Mediolanu; punkt poza zakresem nie uruchamia routingu i pokazuje komunikat „cel jeszcze nieobsługiwany”; granica jest konfigurowalna |
| US-32 | Test logowania bez zgody marketingowej oraz z wyrażoną zgodą | Domyślnie e-mail nie jest oznaczony jako lead marketingowy; użycie do marketingu wymaga zapisanej, dobrowolnej zgody, a jej wycofanie i usunięcie konta usuwają zgodę |

### Major component gates

> Poniższe pozycje są definicjami bramek odbioru, nie statusem implementacji. Wszystkie pozostają oczekujące do czasu dostarczenia wskazanych dowodów.

1. **Flight Context Resolver — oczekuje na realizację**
   - Kontrakt providera posiada testy fixture i sandbox.
   - Reprezentatywny zestaw co najmniej 10 rzeczywistych lotów Polska–BGY osiąga próg rozpoznania co najmniej 9/10.
   - Każdy błąd providera prowadzi do ręcznego fallbacku.

2. **Journey Recommendation Engine — oczekuje na realizację**
   - Co najmniej 9/10 reprezentatywnych scenariuszy BGY–Mediolan ma wynik zgodny z oficjalnymi źródłami przewoźników.
   - Każdy wynik ujawnia kompletność ceny i pochodzenie danych.
   - Koszt, liczba wywołań i opóźnienie pełnej ścieżki są zmierzone na spike'u i zapisane jako dowód decyzji go/no-go.

3. **Flight Room — oczekuje na realizację**
   - Izolacja pokoi po kanonicznej instancji lotu jest pokryta testami.
   - Dwaj klienci wymieniają wiadomości w czasie nieprzekraczającym 5 sekund w środowisku testowym.
   - Granice +24 godziny i +30 dni są pokryte testami z kontrolowanym zegarem.

4. **Identity & Safety — oczekuje na realizację**
   - OTP, pseudonim, blokowanie, zgłaszanie i akceptacja zasad mają testy pozytywne oraz negatywne.
   - Automatyczny test prywatności potwierdza brak e-maila i dokładnego celu we wszystkich publicznych payloadach.
   - Rola operatora jest egzekwowana po stronie serwera; zwykły użytkownik nie ma dostępu do panelu ani operacji katalogu.
   - Zgoda marketingowa jest odrębna od logowania, domyślnie wyłączona i podlega wycofaniu.
   - Polityka prywatności, retencji i usunięcia konta przechodzi przegląd przed produkcyjnym pilotem.

5. **Operator Console — oczekuje na realizację**
   - Panel administracyjny wykonuje pełny CRUD katalogu transferów wyłącznie dla roli operatora.
   - Walidacja świeżości i wymaganych pól blokuje publikację niekompletnych wpisów.
   - Panel nie eksponuje dokładnych celów podróży ani treści czatów.

6. **Repository quality gate**
   - `pnpm run lint` kończy się kodem 0.
   - `pnpm run types` kończy się kodem 0.
   - `pnpm run test` kończy się kodem 0.
   - Każde kryterium liczbowe powyżej posiada automatyczny test albo zapisany wynik reprezentatywnego spike'u z opisem próby i założeń.

### Product validation

- **Poprawność:** co najmniej 9/10 reprezentatywnych podróży kończy się prawidłowym wariantem przejazdu.
- **Ocena użytkowników:** pilotaż obejmuje rzeczywistych przedstawicieli grupy solo traveler/backpacker; obserwujemy wykonanie zadania bez podpowiadania oraz zbieramy jakościową ocenę zrozumiałości i zaufania do rekomendacji.
- **Efekt społecznościowy:** mierzymy odsetek pokoi z co najmniej dwiema osobami, odsetek użytkowników wybierających transport oraz przypadki faktycznie zadeklarowanego wspólnego przejazdu.
- **Powrót:** mierzymy dodanie kolejnego lotu przez tego samego użytkownika; do czasu rzeczywistej kolejnej podróży deklarowana chęć powrotu nie jest uznawana za zweryfikowaną retencję.
- **Go/no-go:** pełna implementacja poza korytarzem BGY nie rozpoczyna się, jeśli spike nie osiąga progu 9/10 albo koszty i ograniczenia licencyjne providera nie są zaakceptowane na podstawie pomiaru.

## Out of Scope

- Lotniska inne niż Mediolan-Bergamo.
- Cele poza Mediolanem (ograniczenie miękkie, ale egzekwowane: patrz US-31 — cel poza obszarem Mediolanu nie generuje trasy).
- Dojazd z miejsca zamieszkania na polskie lotnisko oraz obsługa podróży przed odlotem poza czatem.
- Status lotu na żywo, opóźnienia, zmiana bramki i automatyczne przeliczanie po zakłóceniu.
- Gwarantowana opcja „najtańsza”.
- Zakup, rezerwacja, zwrot lub przechowywanie biletów.
- Przyjmowanie płatności, portfel, dzielenie rachunku i rozliczenia taksówki.
- Zamawianie prywatnego kierowcy lub marketplace kierowców.
- Weryfikacja karty pokładowej, dokumentu tożsamości lub tożsamości współpasażera.
- Podgrupy transportowe, wiadomości prywatne, zdjęcia profilowe, trwałe profile, obserwowanie i system reputacji.
- Automatyczna moderacja treści i całodobowa obsługa bezpieczeństwa.
- Udostępnianie dokładnego adresu noclegu innym użytkownikom bez jawnej zgody (dobrowolny tekstowy punkt wysiadki jest częścią MVP; automatyczne ujawnianie pozostaje poza zakresem).
- Nawigacja wewnątrz terminala, katalog wszystkich POI lotniska i tryb offline.
- Natywne aplikacje iOS i Android w MVP (odłożone, nie wykluczone; API pozostaje niezależne od klienta, aby dodać je później).
- Pełny self-hosting routingu, geokodowania i danych lotniczych.
- Formalne SLA i optymalizacja pod niezweryfikowaną skalę.

## Further Notes

### Recommended delivery gates

1. **Provider readiness:** zbudować kontrakty i deterministyczne fixtures, a po udostępnieniu credentials uruchomić live spike; aktywować providera produkcyjnie dopiero po zapisaniu pokrycia, kosztu, opóźnienia i zaakceptowaniu warunków.
2. **Planner vertical slice:** numer lotu → cel → trzy warianty → zewnętrzny link, bez logowania i społeczności.
3. **Community vertical slice:** OTP → pokój lotu → wybór transportu → czat → blokowanie/zgłoszenie.
4. **Lifecycle and privacy:** zamknięcie pokoju, retencja, usunięcie danych i test przecieków.
5. **Field pilot:** rzeczywisty lot Polska–BGY z zaproszonymi użytkownikami oraz obserwacja pełnej ścieżki.

Każda bramka ma dostarczyć mierzalny dowód. Przejście do następnej bramki nie oznacza, że kryteria późniejszych etapów są zweryfikowane.

### Zaimplementowane rozszerzenia nawigacji pokoju (poza kolejką S0–S10)

Stan na 2026-08-05. Trzy addytywne rozszerzenia UX wdrożone po slice'ach S0–S10; nie zmieniają żadnej zablokowanej decyzji ani inwariantu prywatności:

1. **Powrót do pokoju z członkostwa serwerowego (wspiera US-14, US-22):** `/app` odtwarza otwarty pokój z `GET /rooms` (członkostwo po stronie serwera), a nie wyłącznie ze stanu przeglądarki — utrata `sessionStorage` (nowa karta, urządzenie, restart) nie odcina od pokoju. Wybór transportu z planera jest aplikowany dokładnie raz; kolejne wejścia zachowują deklarację zapisaną po stronie serwera (US-19).
2. **„Moje loty" (wspiera US-14, US-19):** `GET /rooms` zwraca kontekst lotu (`flight` w pozycji listy); przy kilku otwartych pokojach `/app` pokazuje wybór lotu, w pokoju dostępny jest przełącznik „Moje loty", a nawigacja pokazuje licznik otwartych pokojów.
3. **„Poprzednie loty" (zgodne z US-23):** `GET /rooms/past` zwraca wyłącznie tożsamość lotu (bez identyfikatora pokoju, uczestników i wiadomości), ograniczone do okna 30 dni po zamknięciu pokoju i maks. 10 pozycji — historia podróży pozostaje czasowa. Przycisk „Zaplanuj ponownie" prefiluje planer (`/?flightNumber=…`), wspierając metrykę powrotu (dodanie kolejnego lotu przez tego samego użytkownika).

### Future considerations (poza MVP)

- **Wydłużone okno komunikacji po przylocie** — obecnie pokój staje się niedostępny 24 godziny po planowanym lądowaniu i tak zostaje w MVP (potwierdzone przez klienta). W przyszłości można rozważyć pozostawienie kanału komunikacji na wypadek potrzeby pomocy za granicą — polskojęzyczna grupa z tego samego lotu jako nieformalny backup przy dużych zakłóceniach. To wyłącznie kierunek do rozważenia, świadomie niewprowadzany teraz, aby nie rozszerzać zakresu.
- **Klient natywny (iOS/Android)** — planowany po MVP; architektura MVP celowo utrzymuje niezależną od klienta granicę API, aby dodanie go nie wymagało przebudowy backendu.
- **Model monetyzacji** — przy wyłączonych płatnościach główną wartością są leady do bazy i retencja; przyszła monetyzacja powinna opierać się na tej wartości i wymaga odrębnej zgody marketingowej (US-32).

### Reference sources for the data spike

- Google Routes transit documentation: https://developers.google.com/maps/documentation/routes/transit-route
- Google Routes billing and quotas: https://developers.google.com/maps/documentation/routes/usage-and-billing
- MobilityDatabase Italy feeds: https://mobilitydatabase.org/feeds?q=italy
- OpenStreetMap license and attribution: https://www.openstreetmap.org/copyright
- Milan Bergamo Airport ground transport: https://www.milanbergamoairport.it/en/bus/
- Aviationstack product and commercial plans: https://aviationstack.com/pricing
