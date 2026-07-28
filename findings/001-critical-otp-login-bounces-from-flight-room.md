# CRITICAL — poprawne logowanie OTP odsyła podróżnego z powrotem do logowania

**Status:** potwierdzone, 3/3 powtórzenia<br>
**Priorytet:** critical<br>
**Obszar:** mobilne logowanie OTP → wejście do pokoju lotu<br>
**Środowisko:** rzeczywisty TanStack Start + Better Auth + Hono w domyślnym trybie fixture, viewport 390×844
**Duplikat:** nie znaleziono

## Użytkownik i granica zaufania

Problem dotyczy polskojęzycznego solo/budget travelera, który anonimowo rozpoznał lot
Polska → BGY, wybrał prywatny cel w Mediolanie i wariant przejazdu, a następnie chce wejść
do wspólnego pokoju lotu.

Ścieżka przechodzi przez następujące granice:

1. TanStack Start zapisuje w `sessionStorage` wyłącznie zredagowaną intencję pokoju
   (kanoniczny lot + publiczny wybór transportu); dokładny cel pozostaje w prywatnym
   planerze.
2. Better Auth weryfikuje OTP i ustanawia sesję cookie.
3. Chroniona trasa `/app` powinna odczytać świeżą sesję, a następnie przez Hono dołączyć
   użytkownika do pokoju przechowywanego w Postgres i połączyć go z Durable Object przez
   WebSocket.

Awaria występuje pomiędzy punktami 2 i 3: uwierzytelnienie kończy się sukcesem, ale
frontend nie dopuszcza świeżo zalogowanego użytkownika do chronionej trasy.

## Warunki wstępne

- Uruchomione bez zmian:
  - `pnpm run dev:data-service`
  - `pnpm run dev:user-application`
- Domyślni providerzy fixture i lokalny Email Service.
- Nowa sesja przeglądarki, bez wcześniejszego logowania.
- Viewport mobilny 390×844.
- Zwykły użytkownik, bez roli operatora.

## Kroki reprodukcji

1. Otwórz `/`, wpisz lot `FR1234` z datą `14.09.2026`, wybierz `Duomo di Milano` i
   poczekaj na rekomendację.
2. Naciśnij **„Wybierz i przejdź do pokoju”**. Wybrany cel i wariant są widoczne na
   [ekranie planera](./evidence/screenshots/actual-duomo-recommendations-full.png).
3. Na `/signin` wpisz nowy adres e-mail i naciśnij **„Wyślij kod”**:
   [ekran e-mail](./evidence/screenshots/issue-001-step-2-email.png).
4. Odczytaj kod z lokalnej wiadomości Email Service. Formularz prawidłowo przechodzi do
   [kroku OTP](./evidence/screenshots/issue-001-step-3-otp-prompt.png).
5. Wpisz poprawny, aktualny kod:
   [kod gotowy do wysłania](./evidence/screenshots/issue-001-step-4-code-entered.png).
6. Naciśnij **„Zaloguj się”**.

## Wynik oczekiwany i rzeczywisty

**Oczekiwany:** po poprawnym OTP użytkownik trafia na `/app`, ustawia pseudonim i
kontynuuje wejście do pokoju właściwego lotu. Zredagowana intencja pokoju pozostaje
zachowana.

**Rzeczywisty:** żądanie logowania kończy się HTTP 200 i powstaje ważna sesja, ale
użytkownik zostaje na `/signin`. Formularz bez komunikatu sukcesu lub błędu wraca do
pierwszego kroku **„Wyślij kod”**:
[wynik po poprawnym OTP](./evidence/screenshots/issue-001-result-stuck-signin.png).

Zredagowany [HAR](./evidence/issue-001-auth-navigation.har) potwierdza:

- `POST /api/auth/sign-in/email-otp` → 200;
- następujące po nim `GET /api/auth/get-session` → 200;
- brak błędu JavaScript i brak odpowiedzi 4xx/5xx.

W chwili odbicia `landingos.room-intent` nadal istnieje w `sessionStorage`. Kontrolne,
ręczne otwarcie `/app` w tej samej sesji natychmiast pokazuje formularz pseudonimu:
[ważna sesja i intencja działają po ręcznym wejściu](./evidence/screenshots/issue-001-control-manual-app-works.png).
To wyklucza błędny OTP, utratę intencji i awarię API pokoju.

## Wpływ na podróżnego i uzasadnienie critical

Normalna ścieżka wejścia do Flight Room jest zablokowana po udanym logowaniu. Użytkownik
widzi ponownie wezwanie do wysłania kodu, więc może wielokrotnie obracać poprawne kody,
wyczerpać limit prób lub porzucić pokój. Interfejs nie pokazuje linku do `/app`, informacji
o sukcesie ani sposobu odzyskania ścieżki.

Blokuje to pseudonim, wybór/wymianę deklaracji transportu, czat, blokowanie, zgłaszanie i
akceptację zasad — całą społecznościową połowę głównego workflow. Jedynym obejściem jest
ręczne wpisanie nieujawnionego adresu `/app`, czego nie można oczekiwać od podróżnego.

## Odpowiedzialna ścieżka i prawdopodobna przyczyna

1. `JourneyPlanner` zapisuje prawidłową, prywatnościowo bezpieczną intencję i kieruje na
   `/app` (`apps/user-application/src/components/journey/journey-planner.tsx:212`).
2. Niezalogowany użytkownik jest kierowany na `/signin` przez chroniony layout.
3. Po sukcesie OTP `EmailAuth.verifyCode()` od razu wykonuje klientowe `navigate()` do
   `/app` (`apps/user-application/src/components/auth/email-auth.tsx:61`).
4. Chroniony layout sprawdza `authClient.useSession()` i przy `!isPending && !data`
   natychmiast odsyła do `/signin`
   (`apps/user-application/src/routes/_auth/route.tsx:11`).

Najbardziej prawdopodobną przyczyną jest wyścig między klientową nawigacją po OTP a
odświeżeniem cache sesji Better Auth. `/app` widzi jeszcze poprzednie `null`, odsyła do
`/signin`, a dopiero potem `get-session` potwierdza ważną sesję. Trasa `/signin` nie
przekierowuje już zalogowanego użytkownika dalej, więc remount `EmailAuth` resetuje krok do
`email`.

Obecne E2E nie wykrywa problemu, ponieważ aliasuje prawdziwy klient auth na
`e2e/mock-auth-client.ts`. Mock zapisuje sesję do `localStorage` i synchronicznie wywołuje
`notify()` przed zwrotem sukcesu (`apps/user-application/e2e/mock-auth-client.ts:56`);
konfiguracja aliasu znajduje się w `apps/user-application/e2e/vite.config.ts:14`. Ten model
nie odtwarza wyścigu cookie/cache prawdziwego Better Auth.

## Proponowana naprawa

Po poprawnym OTP należy ustanowić jednoznaczną granicę „sesja gotowa” przed wejściem na
chronioną trasę:

- najprościej wykonać pełną nawigację dokumentu do celu (`/app` przy istniejącej intencji,
  `/` bez niej) dopiero po sukcesie Better Auth, aby chroniony layout zainicjalizował sesję
  z cookie;
- alternatywnie jawnie odświeżyć/zinwalidować store sesji Better Auth i czekać na
  niepustą sesję przed klientowym `navigate()`;
- dodatkowo `/signin` powinno odzyskiwać tę sytuację: ważna sesja + intencja pokoju
  przekierowuje do `/app`, zamiast ponownie pokazywać wysyłanie OTP.

Nie należy zapisywać tokenu w `localStorage` ani rozszerzać intencji o e-mail lub prywatny
cel.

## Kryteria akceptacji regresji

- [ ] W teście z **prawdziwym klientem Better Auth** i lokalnym/fake Email Service:
      planer → wybór wariantu → OTP → pseudonim kończy się na `/app` przy 390×844 i
      1440×900.
- [ ] Po `POST /api/auth/sign-in/email-otp` = 200 interfejs ani przez jedną klatkę nie
      wraca do pierwszego kroku `/signin`; nie wysyła też drugiego kodu.
- [ ] Chroniona trasa czeka na świeży stan sesji i nie odsyła poprawnie zalogowanego
      użytkownika na podstawie cache sprzed logowania.
- [ ] Wejście na `/signin` z ważną sesją i `landingos.room-intent` odzyskuje `/app`;
      z ważną sesją bez intencji prowadzi do `/`.
- [ ] Intencja po logowaniu nadal zawiera wyłącznie kanoniczny identyfikator lotu oraz
      zredagowany wybór publiczny; brak adresu, place ID, współrzędnych i e-maila.
- [ ] Błędny lub wygasły OTP nadal pozostawia użytkownika na kroku kodu z polskim
      komunikatem, bez utworzenia sesji.
- [ ] Test regresji nie używa `e2e/mock-auth-client.ts` dla tego scenariusza i pozostaje
      deterministyczny oraz bez zewnętrznych sekretów.

## Sprawdzenie duplikatów

Przed zaakceptowaniem znaleziono i sprawdzono:

- brak wcześniejszego katalogu/raportu `findings/`;
- lokalne testy auth, room-intent i E2E;
- dokumentację, changelog i canonical PRD;
- wszystkie GitHub issues #1–#12 (otwarte i zamknięte);
- wszystkie pull requesty (brak);
- celowane wyszukiwania GitHub i repozytorium dla `OTP redirect room signin session`,
  `post-login`, `stale session` i równoważnych fraz.

Nie znaleziono wcześniejszego zgłoszenia tego zachowania. Issues #3 i #12 wymagają
działającej ścieżki OTP → pokój, ale nie raportują tego błędu.
