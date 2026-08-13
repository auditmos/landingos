# Znane ograniczenia dostawców na stagingu (QA)

Ten dokument uzupełnia przewodnik QA (#14). Opisuje, które niepowodzenia na stagingu są
**oczekiwane** przy obecnych planach zewnętrznych dostawców, a które są błędem do zgłoszenia.
Nie jest to zgoda na produkcję: przydatność dostawców, akceptacja kosztowo-licencyjna i
zgoda prywatnościowa pozostają **nierozstrzygnięte**.

## Zmierzony stan (2026-08-12)

Źródło pomiarów: [`docs/evidence/s0-provider-readiness.md`](../evidence/s0-provider-readiness.md)
oraz [`docs/evidence/data/issue16-live-flight-results.json`](../evidence/data/issue16-live-flight-results.json).

| Obszar danych | Zmierzony wynik | Co to znaczy dla QA |
| --- | --- | --- |
| Rozpoznawanie lotów (Aviationstack) | 9/10 znormalizowanych, **7/10 poprawnych** | Część prawdziwych lotów przejdzie w tryb ręczny albo poda inną godzinę przylotu. To znany, otwarty problem (#16), nie nowy błąd. |
| Miejsca (Google Places New) | **0/5 udanych** (4 × `ambiguous`, 1 × `incomplete_response`) | Podpowiedzi adresów bywają niekompletne. Wpisz pełniejszy adres i spróbuj ponownie. |
| Trasy (Google Routes transit) | **9/10 udanych** (1 × `incomplete_response`) | Zdecydowana większość zapytań o trasę działa. |

Wymagany próg poprawności rozpoznawania lotów to 9/10 — obecny wynik **nie spełnia** tego progu.

## Czego dotyczą limity — precyzyjnie

- **Aviationstack**: plan konta jest limitowany (liczba zapytań miesięcznie, licencja
  osobista, część funkcji tylko w planach płatnych). Dokładne zachowanie konta wynika z
  pomiaru, a nie z samego kodu HTTP. Cennik: <https://aviationstack.com/pricing>.
- **Google Maps Platform**: to **nie jest** „darmowa wersja”. Rozliczenia muszą być włączone,
  każde SKU ma własny miesięczny limit bezpłatnego użycia oraz własne kwoty. Samo HTTP 403
  **nie dowodzi**, że osiągnięto limit bezpłatny.
  <https://developers.google.com/maps/billing-and-pricing/pricing>,
  <https://developers.google.com/maps/documentation/places/web-service/usage-and-billing>.

Dlatego aplikacja nigdy nie twierdzi, że winny jest „darmowy plan”, dopóki dostawca nie zwróci
udokumentowanego kodu błędu, który to potwierdza.

## Co widzi podróżny

Przy każdym niepowodzeniu ekran lotu, miejsca i tras pokazuje:

1. krótkie polskie wyjaśnienie, co się stało;
2. jedno konkretne działanie: **ponów**, **zmień dane** albo **skorzystaj z alternatywy ręcznej**;
3. notkę, że LandingOS działa w wersji MVP na ograniczonych planach zewnętrznych dostawców —
   bez obwiniania poprawnych danych podróżnego.

## Co może rozwinąć tester (tylko poza produkcją)

Sekcja „Szczegóły diagnostyczne” pojawia się na `local`, `dev`, `test` i `staging`. Zawiera
wyłącznie bezpieczne dane:

- **Obszar danych**: `lot`, `miejsce` albo `trasa`;
- **Kategoria** — jedna z siedmiu znormalizowanych:
  limit zapytań, ograniczenie planu, dostęp/konfiguracja, brak pokrycia danych,
  chwilowa awaria, niepełna odpowiedź, nierozpoznana awaria;
- **Czas zdarzenia** w UTC;
- **Numer korelacji** (identyfikator żądania) do dopasowania z logami.

Na produkcji ta sekcja **nie jest renderowana** — odpowiedź zawiera tylko numer korelacji,
czas i zalecane działanie. W żadnym środowisku nie pojawiają się: klucze API, surowe
odpowiedzi dostawcy, e-maile ani dokładny adres docelowy podróżnego.

## Kiedy zgłosić błąd

Zgłoś, jeśli:

- ekran zostaje w stanie ładowania i nigdy nie pokazuje wyniku ani komunikatu;
- komunikat sugeruje, że dane podróżnego są błędne, choć są poprawne;
- niepowodzenie 401/403 zostaje opisane jako limit darmowego planu, problem rozliczeń lub kwota;
- w interfejsie, logach lub zdarzeniach analitycznych pojawi się klucz API, treść odpowiedzi
  dostawcy, e-mail albo dokładny adres docelowy.

Nie zgłaszaj samego faktu, że lot się nie rozpoznał albo że podpowiedzi adresu były
niekompletne — to udokumentowane, zmierzone ograniczenie z tabeli powyżej.

## Status wydania

Gotowość produkcyjna: **NOT READY**. Nierozstrzygnięte pozostają: pomiar przydatności
dostawcy (#16), akceptacja kosztowo-licencyjna przez osobę z uprawnieniami budżetowymi oraz
niezależna zgoda prywatnościowa. Ten dokument niczego z tych trzech rzeczy nie zamyka.
