# Zakładanie kont właścicielki LandingOS (checklista)

Ten dokument jest dla Pauliny. Przechodzimy go razem podczas jednej rozmowy
z udostępnionym ekranem (ok. 60 minut): Ty klikasz, ja podpowiadam. Po rozmowie możesz
tu wrócić i sprawdzić każdy krok samodzielnie.

**Zasada numer jeden:** każde hasło i każdy klucz zapisujemy od razu w Bitwardenie,
w kolekcji `infra`. Nigdy nie wysyłamy ich SMS-em, mailem ani na Messengerze.

## Ile to kosztuje miesięcznie

| Usługa | Do czego służy | Teraz | Po starcie produkcji |
|---|---|---|---|
| Bitwarden | wspólny sejf na hasła i klucze | 0 zł | 0 zł |
| Neon | baza danych aplikacji | 0 zł (plan Free) | ok. 19 USD/mies. (plan Launch) |
| Google Maps Platform | adresy i trasy dojazdu po Mediolanie | 0 zł (limit darmowy) | zależnie od użycia (pilnuje tego alert budżetowy) |
| AviationStack | dane o lotach | 0 zł (plan Free, 100 zapytań/mies.) | 49,99 USD/mies. (plan Basic, licencja komercyjna) |

Do płatności podpinasz swoją kartę, bo te konta są Twoje. Tomek ma do nich dostęp
roboczy: wystarcza mu do pracy, ale nie pozwala niczego usunąć ani przenieść i nie
obejmuje płatności.

## Krok 0: Bitwarden (ok. 10 min)

- [ ] Wejdź na <https://bitwarden.com>, załóż darmowe konto na swój adres e-mail.
- [ ] Włącz weryfikację dwuetapową (aplikacja typu Google Authenticator) i zapisz kody
      zapasowe w swoim prywatnym sejfie.
- [ ] Utwórz **Organizację** o nazwie `LandingOS` (darmowy plan wystarcza dla dwóch osób).
- [ ] W organizacji utwórz kolekcję `infra` i zaproś Tomka na jego adres Gmail
      (ma już konto Bitwarden, poda Ci adres na rozmowie).
- [ ] Umawiamy się: wszystko, co tajne, ląduje w `infra`. Zawsze.

## Krok 1: Neon, baza danych (ok. 15 min)

- [ ] Wejdź na <https://neon.com> i zaloguj się przez swoje konto Google.
- [ ] Utwórz **Organizację** `LandingOS`.
- [ ] W zakładce **People** zaproś Tomka z rolą **Editor** (może pracować z bazą,
      nie może jej usunąć ani przenieść, nie widzi płatności).
- [ ] Zostajemy na planie Free. Przed startem produkcji podniesiemy plan na **Launch**
      i wtedy podepniesz kartę.
- [ ] Po rozmowie Tomek przekaże istniejącą bazę do Twojej organizacji specjalnym
      linkiem (tzw. claim link). Dostaniesz go i klikniesz „przejmij". Aplikacja
      w trakcie przenosin działa bez przerwy.

## Krok 2: Google Cloud i Mapy (ok. 25 min, najbardziej „klikany" krok)

- [ ] Wejdź na <https://console.cloud.google.com> i zaloguj się swoim kontem Google.
- [ ] Załóż **konto rozliczeniowe** (Billing) i podepnij kartę.
- [ ] Utwórz **projekt** o nazwie `landingos-prod`.
- [ ] W ustawieniach dostępu (**IAM**) dodaj Tomka do projektu z rolą **Editor**,
      a na koncie rozliczeniowym z rolą **Billing Account Viewer** (widzi wydatki,
      nie może ruszyć płatności).
- [ ] Ustaw **alert budżetowy**: np. 200 zł/miesiąc, powiadomienia przy 50%, 90%
      i 100%. Powiadomienia mają przychodzić na Twój i Tomka adres e-mail.
- [ ] Zaakceptuj warunki **Google Maps Platform**. Robisz to Ty jako właścicielka.
      Datę akceptacji zapisujemy w dokumentacji projektu (to formalny warunek startu
      produkcji).
- [ ] Klucze do map utworzy później Tomek (z ograniczeniami, żeby nikt obcy nie mógł
      ich użyć) i zapisze je w Bitwardenie.

## Krok 3: AviationStack, dane o lotach (ok. 10 min)

- [ ] Wejdź na <https://aviationstack.com> i załóż konto na swój e-mail.
- [ ] Hasło wygeneruj Bitwardenem i zapisz je od razu w kolekcji `infra`
      (to konto jest jednoosobowe, więc korzystamy z niego wspólnie, przez sejf).
- [ ] Zapisz w tej samej notatce klucz dostępu (**API Access Key**) z panelu.
- [ ] Zostajemy na planie Free. Przed startem produkcji przejdziesz na plan **Basic**
      (49,99 USD/mies.). To on daje licencję komercyjną.
- [ ] W Gmailu ustaw filtr: maile z `aviationstack.com` przekazuj do Tomka
      (będą tam ostrzeżenia o zużyciu limitu zapytań).

## Co masz po tej rozmowie

- Trzy konta usług z danymi są **Twoje**: baza danych, mapy Google, dane o lotach.
  Ty za nie płacisz i Ty akceptujesz ich regulaminy.
- Tomek ma dostęp roboczy: wystarcza do pracy, nie pozwala niczego bezpowrotnie
  zepsuć ani przenieść.
- Wszystkie hasła i klucze są w jednym wspólnym sejfie, do którego oboje macie dostęp.
- Domena, serwery (Cloudflare) i kod (GitHub) zostają na razie u Tomka — ich
  ewentualne przeniesienie to osobny, opisany już plan na później.
