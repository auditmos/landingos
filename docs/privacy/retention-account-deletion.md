# Macierz retencji i usunięcia konta

Wersja: 2026-07-27-v1

| Dane lub operacja | Aktywny okres | Granica i działanie |
|---|---|---|
| Dostęp do pokoju, lista członków, historia, połączenie i ponowne połączenie WebSocket, wysyłanie | Do `scheduledArrivalUtc + 24h`, wyłącznie przed tą chwilą | Przy `roomClosesAt` i później serwer zwraca `room_closed`; UI usuwa pokój, a alarm Durable Object zamyka aktywne sockety |
| Treść wiadomości | Pokój otwarty oraz zamknięty, ale po zamknięciu niedostępny publicznie | Przy `messagePurgeAt = roomClosesAt + 30 dni` treść staje się `NULL` w aktywnej bazie |
| Snapshot wiadomości w zgłoszeniu | Do zwykłego `messagePurgeAt`, bez wyjątku dla otwartego zgłoszenia | Przy dokładnej granicy snapshot staje się `NULL`; rekord zgłoszenia może zachować wyłącznie nieprywatne metadane |
| Pseudonim, e-mail, profil i zgoda marketingowa | Do usunięcia konta | Usuwane w tym samym żądaniu co konto |
| Sesje cookie i Bearer oraz konta uwierzytelniania | Do usunięcia konta | Wszystkie są unieważniane przez Better Auth; ponowienie bez aktywnej sesji nie usuwa cudzych danych |
| Członkostwa i wybory transportu | Do usunięcia konta albo usunięcia pokoju | Usuwane natychmiast przy usunięciu konta |
| Nie zgłoszona wiadomość usuwanego autora | Do usunięcia konta | Natychmiastowy tombstone treści i pseudonimu, bez identyfikatora konta |
| Zgłoszona wiadomość usuwanego autora | Do usunięcia konta / zwykłego purge | Publiczna wiadomość otrzymuje tombstone; prywatny snapshot zachowuje treść bez powiązania z kontem do `messagePurgeAt`, potem jest usuwany |
| Dokładny adres, place ID i współrzędne planera | Tylko pamięć bieżącego przepływu i niezbędne żądanie planera | Nie są zapisywane w tabelach konta, pokoju ani analityki; lokalny kontekst planera jest czyszczony po usunięciu konta |
| Zdarzenia analityczne | Kontrolowany rejestr bez prywatnych pól | Pozostaje wyłącznie pseudonim HMAC bez tabeli mapującej do usuniętego konta |

Cron uruchamia jedną ograniczoną partię maksymalnie 100 pokojów co 5 minut w `dev`,
`staging` i `production`. Autoryzacja sprawdza `roomClosesAt` bezpośrednio, dlatego opóźniony
cron nie otwiera zamkniętego pokoju. Czyszczenie jest idempotentne i bezpieczne przy
ponowieniu.

Repozytorium nie usuwa kopii zapasowych ani logów pozostających pod kontrolą dostawcy
infrastruktury. Ich retencja wymaga osobnego potwierdzenia operacyjnego i niezależnego
przeglądu przed pilotem.

Status: `implementation verified; independent compliance approval pending`.
