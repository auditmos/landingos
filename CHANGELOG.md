## [1.36.15](https://github.com/auditmos/landingos/compare/v1.36.14...v1.36.15) (2026-08-25)

## [1.36.14](https://github.com/auditmos/landingos/compare/v1.36.13...v1.36.14) (2026-08-25)

## [1.36.13](https://github.com/auditmos/landingos/compare/v1.36.12...v1.36.13) (2026-08-25)

## [1.36.12](https://github.com/auditmos/landingos/compare/v1.36.11...v1.36.12) (2026-08-25)

## [1.36.11](https://github.com/auditmos/landingos/compare/v1.36.10...v1.36.11) (2026-08-25)

## [1.36.10](https://github.com/auditmos/landingos/compare/v1.36.9...v1.36.10) (2026-08-25)

## [1.36.9](https://github.com/auditmos/landingos/compare/v1.36.8...v1.36.9) (2026-08-25)

## [1.36.8](https://github.com/auditmos/landingos/compare/v1.36.7...v1.36.8) (2026-08-25)

## [1.36.7](https://github.com/auditmos/landingos/compare/v1.36.6...v1.36.7) (2026-08-25)

## [1.36.6](https://github.com/auditmos/landingos/compare/v1.36.5...v1.36.6) (2026-08-25)

## [1.36.5](https://github.com/auditmos/landingos/compare/v1.36.4...v1.36.5) (2026-08-25)

## [1.36.4](https://github.com/auditmos/landingos/compare/v1.36.3...v1.36.4) (2026-08-25)


### Bug Fixes

* **data-service:** stop leaking internal error messages in 500 bodies (F16) ([2ad761f](https://github.com/auditmos/landingos/commit/2ad761f05d9997335315d78f6279a337cb2104f2)), closes [#34](https://github.com/auditmos/landingos/issues/34)

## [1.36.3](https://github.com/auditmos/landingos/compare/v1.36.2...v1.36.3) (2026-08-25)


### Bug Fixes

* **room:** map RoomQueryError to typed 410/404 and derive DO routing from the room ([789ad80](https://github.com/auditmos/landingos/commit/789ad80b9f8fceccebb1f322c6ef721fae85bfeb)), closes [#33](https://github.com/auditmos/landingos/issues/33)

## [1.36.2](https://github.com/auditmos/landingos/compare/v1.36.1...v1.36.2) (2026-08-25)

## [1.36.1](https://github.com/auditmos/landingos/compare/v1.36.0...v1.36.1) (2026-08-25)


### Performance Improvements

* **scheduled:** run the housekeeping cron hourly instead of every 5 minutes ([d959f9b](https://github.com/auditmos/landingos/commit/d959f9b6406463f063845ea1b9337bcb9f57226f))

# [1.36.0](https://github.com/auditmos/landingos/compare/v1.35.3...v1.36.0) (2026-08-22)


### Bug Fixes

* **journeys:** start the Google Maps navigation link at the airport bus station ([fe84af1](https://github.com/auditmos/landingos/commit/fe84af10a45eaa255587a2be484c111c187eb803))
* **planner:** make the date pickers usable on mobile ([8682fc1](https://github.com/auditmos/landingos/commit/8682fc10dad8ee54908f60562d19fd9ae86e1e28)), closes [#27](https://github.com/auditmos/landingos/issues/27)
* **planner:** rename the post-landing buffer and show the resulting departure time ([26b36d4](https://github.com/auditmos/landingos/commit/26b36d4a058fb8271674b9af24b8544449bd9c88)), closes [#14](https://github.com/auditmos/landingos/issues/14) [#29](https://github.com/auditmos/landingos/issues/29)


### Features

* **journeys:** show walking distance in metres below 1 km and kilometres above ([53c54c8](https://github.com/auditmos/landingos/commit/53c54c80f0f57f43c216b262e8273213bf789238)), closes [#28](https://github.com/auditmos/landingos/issues/28)

## [1.35.3](https://github.com/auditmos/landingos/compare/v1.35.2...v1.35.3) (2026-08-22)


### Bug Fixes

* **journeys:** match catalog entries on the structural airport leg ([8d93c89](https://github.com/auditmos/landingos/commit/8d93c89792923891fbd890b6f0e428bf8b23170b)), closes [#14](https://github.com/auditmos/landingos/issues/14) [#26](https://github.com/auditmos/landingos/issues/26)
* **journeys:** tolerate Google proto3 omissions and surface journey diagnostics ([cb3b65b](https://github.com/auditmos/landingos/commit/cb3b65befb52f9b7341ded1f86dbd1db390f01b5)), closes [#25](https://github.com/auditmos/landingos/issues/25)

## [1.35.2](https://github.com/auditmos/landingos/compare/v1.35.1...v1.35.2) (2026-08-22)


### Bug Fixes

* **journeys:** route from the BGY arrivals bus station instead of the runway ([7d38b9c](https://github.com/auditmos/landingos/commit/7d38b9c2b4bb6e1d7757d13ebd22170668bd7d0d)), closes [#24](https://github.com/auditmos/landingos/issues/24)

## [1.35.1](https://github.com/auditmos/landingos/compare/v1.35.0...v1.35.1) (2026-08-13)


### Bug Fixes

* **auth:** reject superseded email OTP codes deterministically ([e22f96c](https://github.com/auditmos/landingos/commit/e22f96c751661a5cb32bab88fe60f8c3064e2b93)), closes [#22](https://github.com/auditmos/landingos/issues/22)

# [1.35.0](https://github.com/auditmos/landingos/compare/v1.34.0...v1.35.0) (2026-08-13)


### Features

* **operator:** standardise field help and make every catalog field operational ([06367cc](https://github.com/auditmos/landingos/commit/06367cc717e71625acccc0e83c140b6e2251bdde)), closes [#21](https://github.com/auditmos/landingos/issues/21)

# [1.34.0](https://github.com/auditmos/landingos/compare/v1.33.4...v1.34.0) (2026-08-13)


### Features

* **diagnostics:** explain MVP provider limits with safe QA detail ([37231ae](https://github.com/auditmos/landingos/commit/37231ae7d6714abef563561ffbbba6731eb6ff92)), closes [#16](https://github.com/auditmos/landingos/issues/16) [#20](https://github.com/auditmos/landingos/issues/20)

## [1.33.4](https://github.com/auditmos/landingos/compare/v1.33.3...v1.33.4) (2026-08-13)


### Bug Fixes

* **safety:** expose message reporting handoff ([3a22adf](https://github.com/auditmos/landingos/commit/3a22adf2038dd29c5ec896a9e79288878cc86b72))

## [1.33.3](https://github.com/auditmos/landingos/compare/v1.33.2...v1.33.3) (2026-08-13)


### Bug Fixes

* **flight:** clarify fallback and record live coverage ([7d031c5](https://github.com/auditmos/landingos/commit/7d031c5c37d0dca509268d205091e59f8fc36414))
* **flight:** normalize manual arrival in Rome ([d2e784e](https://github.com/auditmos/landingos/commit/d2e784ef30420160caf98144b7e2391d7a8a1f2a))

## [1.33.2](https://github.com/auditmos/landingos/compare/v1.33.1...v1.33.2) (2026-08-13)


### Bug Fixes

* **operator:** publish current catalog form values ([0376477](https://github.com/auditmos/landingos/commit/0376477ca6e467aaef8ed968f30207344849a417))

## [1.33.1](https://github.com/auditmos/landingos/compare/v1.33.0...v1.33.1) (2026-08-13)


### Bug Fixes

* **flight:** normalize manual flight room identity ([bf2418a](https://github.com/auditmos/landingos/commit/bf2418aba10d6f09dbf43de11ac74bfef9a00d3a)), closes [#17](https://github.com/auditmos/landingos/issues/17)

# [1.33.0](https://github.com/auditmos/landingos/compare/v1.32.0...v1.33.0) (2026-08-06)


### Features

* **app:** turn the corridor line into a route status board ([768afa2](https://github.com/auditmos/landingos/commit/768afa2b8e32d9d635be41caa6629034e4c8112c))

# [1.32.0](https://github.com/auditmos/landingos/compare/v1.31.0...v1.32.0) (2026-08-06)


### Features

* **app:** tease upcoming destinations in the landing hero ([45d8f71](https://github.com/auditmos/landingos/commit/45d8f714792488fba8364a20fd29a4a81825568b))

# [1.31.0](https://github.com/auditmos/landingos/compare/v1.30.0...v1.31.0) (2026-08-06)


### Features

* **app:** link the landing page back to the flight rooms ([8aa2c13](https://github.com/auditmos/landingos/commit/8aa2c13b7344cb532c41d42a2f4a2a739e76f57e))

# [1.30.0](https://github.com/auditmos/landingos/compare/v1.29.0...v1.30.0) (2026-08-06)


### Features

* **app:** treat an operator account as staff, not a customer ([5226340](https://github.com/auditmos/landingos/commit/5226340a4ec171bcf4139a7ea8472802ffe1eddf))

# [1.29.0](https://github.com/auditmos/landingos/compare/v1.28.2...v1.29.0) (2026-08-06)


### Features

* **app:** send operators from /app to their console ([829e91e](https://github.com/auditmos/landingos/commit/829e91ee4a1bdeecea6b5bb5f08234212c8ee829))

## [1.28.2](https://github.com/auditmos/landingos/compare/v1.28.1...v1.28.2) (2026-08-06)


### Bug Fixes

* **auth:** pass headers to Better Auth in the protected server-fn middleware ([75ae5ed](https://github.com/auditmos/landingos/commit/75ae5ed89db97fad0aae94c9de44c8ffc4f78ca8))

## [1.28.1](https://github.com/auditmos/landingos/compare/v1.28.0...v1.28.1) (2026-08-06)


### Bug Fixes

* **app:** share one navigation list between sidebar and mobile header ([9d36717](https://github.com/auditmos/landingos/commit/9d3671763ead5cb2d380fdbd35850182affcaffb))

# [1.28.0](https://github.com/auditmos/landingos/compare/v1.27.0...v1.28.0) (2026-08-05)


### Features

* **safety:** close and reopen reports from the operator console ([bc5cfab](https://github.com/auditmos/landingos/commit/bc5cfab67272970b3ad2ca428e730c3db3d23c72))

# [1.27.0](https://github.com/auditmos/landingos/compare/v1.26.0...v1.27.0) (2026-08-05)


### Features

* **safety:** operator read path and triage queue for reports ([5b48e34](https://github.com/auditmos/landingos/commit/5b48e349fd201ff323142a41231cf9114d04bc8a))

# [1.26.0](https://github.com/auditmos/landingos/compare/v1.25.0...v1.26.0) (2026-08-05)


### Features

* **room:** Moje loty as a nav page with room deep links ([a4219e6](https://github.com/auditmos/landingos/commit/a4219e6429b0001b1e2e9656e3c00022f350e5d7))

# [1.25.0](https://github.com/auditmos/landingos/compare/v1.24.0...v1.25.0) (2026-08-05)


### Features

* **room:** instant nav-badge refresh; document the navigation extensions ([413a4c4](https://github.com/auditmos/landingos/commit/413a4c476518b5304d85bede0f402d339cc1c0df))

# [1.24.0](https://github.com/auditmos/landingos/compare/v1.23.0...v1.24.0) (2026-08-05)


### Features

* **room:** past-flight replanning and an always-available room switcher ([94ff975](https://github.com/auditmos/landingos/commit/94ff9753c39038a2f70faf0917de03ea443455d1))

# [1.23.0](https://github.com/auditmos/landingos/compare/v1.22.0...v1.23.0) (2026-08-05)


### Features

* **room:** Moje loty list with flight context and nav badge ([ed990c1](https://github.com/auditmos/landingos/commit/ed990c1b696b62f4810bfe6932ac3ffdeb5519c6))

# [1.22.0](https://github.com/auditmos/landingos/compare/v1.21.0...v1.22.0) (2026-08-05)


### Features

* **room:** re-enter the room from server-side membership ([2b19c6b](https://github.com/auditmos/landingos/commit/2b19c6b35c96215763671f6b64d9e546a6de5c94))

# [1.21.0](https://github.com/auditmos/landingos/compare/v1.20.2...v1.21.0) (2026-08-05)


### Features

* **room:** restructure the members list for visual hierarchy ([2f81f9c](https://github.com/auditmos/landingos/commit/2f81f9c76773432b2a0c9dac4ea00ba213f4f850))

## [1.20.2](https://github.com/auditmos/landingos/compare/v1.20.1...v1.20.2) (2026-08-05)


### Bug Fixes

* **room:** icon-only transport modes in the members list ([915ae81](https://github.com/auditmos/landingos/commit/915ae818fa5dfee0550549869e4974d1370e65ed))

## [1.20.1](https://github.com/auditmos/landingos/compare/v1.20.0...v1.20.1) (2026-08-05)


### Bug Fixes

* **room:** use the planner's exact navigation link, drop route steps ([a4f9600](https://github.com/auditmos/landingos/commit/a4f96008e95828c1d6f894572cb6fcaf54e80675))

# [1.20.0](https://github.com/auditmos/landingos/compare/v1.19.0...v1.20.0) (2026-08-05)


### Features

* **room:** maps links for drop-off points and private route summary ([a27a779](https://github.com/auditmos/landingos/commit/a27a779226612d4fe85533a25e1b1ce9c15b2ffb))

# [1.19.0](https://github.com/auditmos/landingos/compare/v1.18.0...v1.19.0) (2026-08-05)


### Features

* **room:** icon actions and clean selection chips in members list ([9257830](https://github.com/auditmos/landingos/commit/92578305cdde12f91ef1dec93319db99ab26c4cf))

# [1.18.0](https://github.com/auditmos/landingos/compare/v1.17.1...v1.18.0) (2026-08-05)


### Features

* **room:** opt-in drop-off point sharing with private destination view ([7f2184d](https://github.com/auditmos/landingos/commit/7f2184da8d138170bc86128c822b585136007f5b))

## [1.17.1](https://github.com/auditmos/landingos/compare/v1.17.0...v1.17.1) (2026-08-05)


### Bug Fixes

* **journey:** make room-entry buttons state their transport declaration ([a262fbc](https://github.com/auditmos/landingos/commit/a262fbc22b0d1bebbce5a6115499dd7734bbebd8))

# [1.17.0](https://github.com/auditmos/landingos/compare/v1.16.0...v1.17.0) (2026-08-05)


### Features

* **journey:** compact variant picker with Google Maps navigation ([8578bd8](https://github.com/auditmos/landingos/commit/8578bd870b9b55612193ae6d34d530a53049acef))
* **landing:** frame BGY corridor as first route with more coming ([482f5ae](https://github.com/auditmos/landingos/commit/482f5aed2320f0d43768f5c1bd6b4265e99ca699))

# [1.16.0](https://github.com/auditmos/landingos/compare/v1.15.0...v1.16.0) (2026-08-04)


### Features

* **user-application:** adopt holding-page brand identity across UI ([ad29b66](https://github.com/auditmos/landingos/commit/ad29b668e7caa3dc3d105e2e6f4539a0e59e293b))

# [1.15.0](https://github.com/auditmos/landingos/compare/v1.14.3...v1.15.0) (2026-08-04)


### Features

* **landing:** add temporary apex holding page ([0d9c377](https://github.com/auditmos/landingos/commit/0d9c37799777327e094943a7d7fe319e01f74adb))

## [1.14.3](https://github.com/auditmos/landingos/compare/v1.14.2...v1.14.3) (2026-08-04)


### Bug Fixes

* **planner:** stabilize localized staging flow ([4f6f417](https://github.com/auditmos/landingos/commit/4f6f417f8c20ef332b97165cecfd2d9aefd645e9))

## [1.14.2](https://github.com/auditmos/landingos/compare/v1.14.1...v1.14.2) (2026-07-28)


### Bug Fixes

* **auth:** stabilize OTP room-entry flow ([96e05d0](https://github.com/auditmos/landingos/commit/96e05d01e714f64112115200c9b55b110c6afd86))

## [1.14.1](https://github.com/auditmos/landingos/compare/v1.14.0...v1.14.1) (2026-07-28)


### Bug Fixes

* **auth:** protect server fns from CSRF and resolve client IP for rate limiting ([c6787fe](https://github.com/auditmos/landingos/commit/c6787fee887f020b299062449bd6bbe75e27da08))

# [1.14.0](https://github.com/auditmos/landingos/compare/v1.13.1...v1.14.0) (2026-07-28)


### Features

* **user-application:** overhaul flight room UX, gate operator nav, fix transport switch ([0a427ff](https://github.com/auditmos/landingos/commit/0a427ffb95e21d3ff34bf939f7701bbadc27a999))

## [1.13.1](https://github.com/auditmos/landingos/compare/v1.13.0...v1.13.1) (2026-07-28)


### Bug Fixes

* **user-application:** allow room WebSocket origin in CSP and fix journey alert wrapping ([1681bd0](https://github.com/auditmos/landingos/commit/1681bd04e0dc5ba6ace95740b4e7626483b612da))

# [1.13.0](https://github.com/auditmos/landingos/compare/v1.12.0...v1.13.0) (2026-07-28)


### Features

* **user-application:** genericize corridor copy and auto-scroll to lookup results ([08633fb](https://github.com/auditmos/landingos/commit/08633fb346136eabceb490fa2241dbf93f6467a6))

# [1.12.0](https://github.com/auditmos/landingos/compare/v1.11.0...v1.12.0) (2026-07-28)


### Features

* gate sign-in and flight lookup with Cloudflare Turnstile ([f8b14f8](https://github.com/auditmos/landingos/commit/f8b14f84e857a7fd6ecec985d87317fb9029f6e3))

# [1.11.0](https://github.com/auditmos/landingos/compare/v1.10.3...v1.11.0) (2026-07-28)


### Features

* **user-application:** expose theme switcher in headers ([4c56495](https://github.com/auditmos/landingos/commit/4c564959cec347bc516c322ac7402d7fe0f2ece3))

## [1.10.3](https://github.com/auditmos/landingos/compare/v1.10.2...v1.10.3) (2026-07-28)


### Bug Fixes

* **data-ops:** prevent OTP crash when generateOTP override is absent ([00d5536](https://github.com/auditmos/landingos/commit/00d5536423fa273b0a336cd1cd055067d3df573b))
* **user-application:** correct operator catalog collection-root URL ([638acf8](https://github.com/auditmos/landingos/commit/638acf829425710a4a695e2c08e24b96af0c06d7))

## [1.10.2](https://github.com/auditmos/landingos/compare/v1.10.1...v1.10.2) (2026-07-27)


### Bug Fixes

* **user-application:** replace deprecated server validators ([2894a02](https://github.com/auditmos/landingos/commit/2894a022b1fb4bcc963af4fca501271dc675a258))

## [1.10.1](https://github.com/auditmos/landingos/compare/v1.10.0...v1.10.1) (2026-07-27)


### Bug Fixes

* **planner:** improve flight lookup and local API access ([1697dc6](https://github.com/auditmos/landingos/commit/1697dc66ac9b33d1151aa258a79866d251ea9b6a))

# [1.10.0](https://github.com/auditmos/landingos/compare/v1.9.0...v1.10.0) (2026-07-27)


### Features

* **pwa:** harden mobile release checks Closes [#12](https://github.com/auditmos/landingos/issues/12) ([76249f5](https://github.com/auditmos/landingos/commit/76249f59031722a46d16a5a9f1ff4587da01a00c))

# [1.9.0](https://github.com/auditmos/landingos/compare/v1.8.0...v1.9.0) (2026-07-27)


### Features

* **lifecycle:** enforce privacy retention and deletion ([#10](https://github.com/auditmos/landingos/issues/10)) ([a4ef0b8](https://github.com/auditmos/landingos/commit/a4ef0b85296de51d98cee84106d3d9e825146731))

# [1.8.0](https://github.com/auditmos/landingos/compare/v1.7.0...v1.8.0) (2026-07-27)


### Features

* **analytics:** add privacy-safe funnel ledger ([#11](https://github.com/auditmos/landingos/issues/11)) ([5a3352b](https://github.com/auditmos/landingos/commit/5a3352baf82e62f4d3167c90e248bd166b5a7891))

# [1.7.0](https://github.com/auditmos/landingos/compare/v1.6.0...v1.7.0) (2026-07-27)


### Features

* **safety:** enforce room safety controls ([#9](https://github.com/auditmos/landingos/issues/9)) ([417c814](https://github.com/auditmos/landingos/commit/417c8145585eaecb88afd60ee55f4a21ef9d3589))

# [1.6.0](https://github.com/auditmos/landingos/compare/v1.5.0...v1.6.0) (2026-07-27)


### Features

* **rooms:** add realtime flight room core ([4ccf5e6](https://github.com/auditmos/landingos/commit/4ccf5e64044c323e24f5f9fc7cdb7e678be87eb3))

# [1.5.0](https://github.com/auditmos/landingos/compare/v1.4.0...v1.5.0) (2026-07-27)


### Features

* **operator:** add transfer catalog console ([78a3aeb](https://github.com/auditmos/landingos/commit/78a3aeb76f90257396fc08f1d059f85b9835620a)), closes [#7](https://github.com/auditmos/landingos/issues/7)

# [1.4.0](https://github.com/auditmos/landingos/compare/v1.3.0...v1.4.0) (2026-07-27)


### Features

* **journeys:** add ranked BGY recommendations ([ff79645](https://github.com/auditmos/landingos/commit/ff796451253170a1ee4261b1f9a83799434ca440)), closes [#6](https://github.com/auditmos/landingos/issues/6)

# [1.3.0](https://github.com/auditmos/landingos/compare/v1.2.0...v1.3.0) (2026-07-27)


### Features

* **destinations:** add private Milan selection ([b4744f1](https://github.com/auditmos/landingos/commit/b4744f1944c34c1caa95ff6e6e43eb6d9d00e621)), closes [#5](https://github.com/auditmos/landingos/issues/5)

# [1.2.0](https://github.com/auditmos/landingos/compare/v1.1.0...v1.2.0) (2026-07-27)


### Features

* **flights:** add anonymous recognition flow ([1e5f3c5](https://github.com/auditmos/landingos/commit/1e5f3c57892c4bf0377a0a2ed0d9b3e321846963)), closes [#4](https://github.com/auditmos/landingos/issues/4)

# [1.1.0](https://github.com/auditmos/landingos/compare/v1.0.0...v1.1.0) (2026-07-27)


### Features

* **auth:** add passwordless OTP identity flow ([3493ce7](https://github.com/auditmos/landingos/commit/3493ce74572a9485f4e247419e0d8df40b23cdf8)), closes [#3](https://github.com/auditmos/landingos/issues/3)

# 1.0.0 (2026-07-27)


### Features

* add provider spike harness ([498d3eb](https://github.com/auditmos/landingos/commit/498d3ebbe551ccd13a04fa84e66a3e015c51bb1d)), closes [#2](https://github.com/auditmos/landingos/issues/2)

## [1.10.1](https://github.com/auditmos/saas-on-cf/compare/v1.10.0...v1.10.1) (2026-07-22)


### Bug Fixes

* **data-ops:** set explicit rootDir for tsc-alias 1.9 ([b182d34](https://github.com/auditmos/saas-on-cf/commit/b182d3401b841ed886fc753c9441dc820753fb11))

# [1.10.0](https://github.com/auditmos/saas-on-cf/compare/v1.9.2...v1.10.0) (2026-05-25)


### Features

* **init-project:** wire wrangler route placeholders from prompts ([#26](https://github.com/auditmos/saas-on-cf/issues/26)) ([191f624](https://github.com/auditmos/saas-on-cf/commit/191f624a91f6175ce7cb753bf1c50d66b1347da9))

## [1.9.2](https://github.com/auditmos/saas-on-cf/compare/v1.9.1...v1.9.2) (2026-05-25)


### Bug Fixes

* **rate-limit:** drop from /health/ready, apply to /clients mutations ([#23](https://github.com/auditmos/saas-on-cf/issues/23)) ([48adf22](https://github.com/auditmos/saas-on-cf/commit/48adf222694fa0a30c68d615f9349077f2c65225))

## [1.9.1](https://github.com/auditmos/saas-on-cf/compare/v1.9.0...v1.9.1) (2026-05-25)


### Bug Fixes

* **config:** declare CLOUDFLARE_ENV in wrangler.jsonc vars per env block ([abf0a95](https://github.com/auditmos/saas-on-cf/commit/abf0a95cc6b5d62404dea00303e8298347967f4c))

# [1.9.0](https://github.com/auditmos/saas-on-cf/compare/v1.8.12...v1.9.0) (2026-05-25)


### Features

* **security:** add defense-in-depth headers to both Workers ([#20](https://github.com/auditmos/saas-on-cf/issues/20)) ([0fbb0e3](https://github.com/auditmos/saas-on-cf/commit/0fbb0e3f8581e5162ca2cb3345452dcfaecff095))

## [1.8.12](https://github.com/auditmos/saas-on-cf/compare/v1.8.11...v1.8.12) (2026-05-25)

## [1.8.11](https://github.com/auditmos/saas-on-cf/compare/v1.8.10...v1.8.11) (2026-05-25)


### Bug Fixes

* **security:** validate x-request-id to prevent log injection ([#18](https://github.com/auditmos/saas-on-cf/issues/18)) ([456d460](https://github.com/auditmos/saas-on-cf/commit/456d460331ba6567e348a9c28e86c3c6aca0d068))

## [1.8.10](https://github.com/auditmos/saas-on-cf/compare/v1.8.9...v1.8.10) (2026-05-25)


### Performance Improvements

* **cors:** cache cors() factory per env + drop stale :5173 origins ([14bcac6](https://github.com/auditmos/saas-on-cf/commit/14bcac6989debb6c845459a2cfd18bedb3aff40c)), closes [#17](https://github.com/auditmos/saas-on-cf/issues/17)

## [1.8.9](https://github.com/auditmos/saas-on-cf/compare/v1.8.8...v1.8.9) (2026-05-25)


### Bug Fixes

* **security:** replace Math.random() with crypto in example workflow ([85cdea7](https://github.com/auditmos/saas-on-cf/commit/85cdea76a4e84fa4036ff3013906dc0f28dcb4d7)), closes [#16](https://github.com/auditmos/saas-on-cf/issues/16)

## [1.8.8](https://github.com/auditmos/saas-on-cf/compare/v1.8.7...v1.8.8) (2026-05-25)


### Bug Fixes

* **auth:** forward all HTTP methods to Better Auth via ANY handler ([391eaaa](https://github.com/auditmos/saas-on-cf/commit/391eaaa5488e7ea7c7236c9e4a9df453f3b78a5a)), closes [#15](https://github.com/auditmos/saas-on-cf/issues/15)

## [1.8.7](https://github.com/auditmos/saas-on-cf/compare/v1.8.6...v1.8.7) (2026-05-25)


### Bug Fixes

* **auth:** make setAuth idempotent to avoid per-request reinit ([5dabd20](https://github.com/auditmos/saas-on-cf/commit/5dabd20c6a3f367c1ac9b359f23d5200bbcae56e))

## [1.8.6](https://github.com/auditmos/saas-on-cf/compare/v1.8.5...v1.8.6) (2026-05-25)


### Bug Fixes

* **workers:** add explicit observability sampling rates and shape test ([c25c55f](https://github.com/auditmos/saas-on-cf/commit/c25c55fea3a4d9a02f668f98a9fada0bf93b4833)), closes [#13](https://github.com/auditmos/saas-on-cf/issues/13)

## [1.8.5](https://github.com/auditmos/saas-on-cf/compare/v1.8.4...v1.8.5) (2026-05-25)


### Bug Fixes

* **workers:** bump stale compatibility_date and add freshness test ([031b4c3](https://github.com/auditmos/saas-on-cf/commit/031b4c312f10926ca9cd83a50f8d5c8ef1f34f6f)), closes [#12](https://github.com/auditmos/saas-on-cf/issues/12)

## [1.8.4](https://github.com/auditmos/saas-on-cf/compare/v1.8.3...v1.8.4) (2026-05-25)


### Bug Fixes

* **types:** correct service-bindings typo and type implicit-any payloads ([d67c799](https://github.com/auditmos/saas-on-cf/commit/d67c799d4d4beb2773ed6fe390d37a5911d62b9d)), closes [#11](https://github.com/auditmos/saas-on-cf/issues/11)

## [1.8.3](https://github.com/auditmos/saas-on-cf/compare/v1.8.2...v1.8.3) (2026-05-24)


### Bug Fixes

* **security:** stop shipping data-service bearer to browser ([#10](https://github.com/auditmos/saas-on-cf/issues/10)) ([c3ed908](https://github.com/auditmos/saas-on-cf/commit/c3ed9088bd8d7ee1caf0987fe00635df9e7c196b))

## [1.8.2](https://github.com/auditmos/saas-on-cf/compare/v1.8.1...v1.8.2) (2026-05-24)


### Bug Fixes

* **security:** replace module-level rate limiter with platform ratelimit binding ([5a0976e](https://github.com/auditmos/saas-on-cf/commit/5a0976e0af37a7be960a8d3d7c556bac8af66095)), closes [#9](https://github.com/auditmos/saas-on-cf/issues/9)

## [1.8.1](https://github.com/auditmos/saas-on-cf/compare/v1.8.0...v1.8.1) (2026-05-05)

# [1.8.0](https://github.com/auditmos/saas-on-cf/compare/v1.7.0...v1.8.0) (2026-05-05)


### Features

* CI/CD pipeline + test-harness (back-port from pi-web) ([560e66e](https://github.com/auditmos/saas-on-cf/commit/560e66ec8054fae8fd2d914a480a0b09b3045340))

# [1.7.0](https://github.com/auditmos/saas-on-cf/compare/v1.6.0...v1.7.0) (2026-03-16)


### Features

* add brainstormer plugin as submodule with skill symlinks ([7780a7a](https://github.com/auditmos/saas-on-cf/commit/7780a7a894744b3d301c4f503de1e18684afb34a))

# [1.6.0](https://github.com/auditmos/saas-on-cf/compare/v1.5.0...v1.6.0) (2026-03-16)


### Features

* adopt AGENTS.md convention with CLAUDE.md symlinks and add llms.txt ([fcb6dca](https://github.com/auditmos/saas-on-cf/commit/fcb6dca4e98d4f7b45ea54b5423d092028be3034))

# [1.5.0](https://github.com/auditmos/saas-on-cf/compare/v1.4.0...v1.5.0) (2026-03-16)


### Features

* expand bug fix workflow to full TDD cycle in rules ([8ca5d0e](https://github.com/auditmos/saas-on-cf/commit/8ca5d0ecc4d10d86321b8566b4afa22f754dd569))

# [1.4.0](https://github.com/auditmos/saas-on-cf/compare/v1.3.0...v1.4.0) (2026-03-16)


### Features

* add vitest test infrastructure and Claude Code hooks ([136b624](https://github.com/auditmos/saas-on-cf/commit/136b6247f2ea1a6900c5bd9c5345dee79bf1759d))

# [1.3.0](https://github.com/auditmos/saas-on-cf/compare/v1.2.0...v1.3.0) (2026-03-15)


### Features

* update dependencies, fix better-auth 1.5.5 type break ([6366f79](https://github.com/auditmos/saas-on-cf/commit/6366f7906f3879a171d5ff25a5ec95b24c993506))

# [1.2.0](https://github.com/auditmos/saas-on-cf/compare/v1.1.0...v1.2.0) (2026-03-15)


### Features

* add taze for dependency update checking ([57c243c](https://github.com/auditmos/saas-on-cf/commit/57c243c79a6e680efb6c99fc79b4d161535a944c))

# [1.1.0](https://github.com/auditmos/saas-on-cf/compare/v1.0.0...v1.1.0) (2026-03-15)


### Features

* add knip and remove unused code/dependencies ([c00825f](https://github.com/auditmos/saas-on-cf/commit/c00825fe92a6c8e6102403cfff37357a2a6953a3))

# 1.0.0 (2026-03-15)


### Features

* add semantic-release and fix all lint/type errors ([a288e57](https://github.com/auditmos/saas-on-cf/commit/a288e57b2dfdfdbc3452b6f3de1f07feb8033dac))
