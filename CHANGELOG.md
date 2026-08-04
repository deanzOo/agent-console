# Changelog

## [0.3.0](https://github.com/deanzOo/agent-console/compare/v0.2.0...v0.3.0) (2026-08-04)


### Features

* show host CPU/memory/network/disk load beside missions running ([#79](https://github.com/deanzOo/agent-console/issues/79)) ([c99e8ca](https://github.com/deanzOo/agent-console/commit/c99e8caf0bf000c255b40da7b94e1426d708a4c7)), closes [#55](https://github.com/deanzOo/agent-console/issues/55)
* **ui:** show what mission worktrees are costing on disk ([#78](https://github.com/deanzOo/agent-console/issues/78)) ([0d3c559](https://github.com/deanzOo/agent-console/commit/0d3c55920ef848a4f0137b8247ae1de70a448bc7))


### Bug Fixes

* **deps:** clear the qs advisory ([#92](https://github.com/deanzOo/agent-console/issues/92)) ([6fd6b0d](https://github.com/deanzOo/agent-console/commit/6fd6b0d101c6a66a4d8a8290a07312c03f76cbe5))
* **deps:** let dependabot propose majors at all ([#85](https://github.com/deanzOo/agent-console/issues/85)) ([f0bed1e](https://github.com/deanzOo/agent-console/commit/f0bed1e0dd6d6489d7151e49badc2eee5f57d8cd))
* **deps:** pin past two high advisories in transitive dependencies ([#83](https://github.com/deanzOo/agent-console/issues/83)) ([7fdec56](https://github.com/deanzOo/agent-console/commit/7fdec5647abb1a1e1c4e65155d81e437c0221513))


### Documentation

* correct what the docs claim, and cover what shipped since ([#69](https://github.com/deanzOo/agent-console/issues/69)) ([8d49383](https://github.com/deanzOo/agent-console/commit/8d49383fbad853def495d50593e4b2148b3976d7))

## [0.2.0](https://github.com/deanzOo/agent-console/compare/v0.1.0...v0.2.0) (2026-08-01)


### Features

* **agents:** add the mission loop with human-in-the-loop approvals ([48896ec](https://github.com/deanzOo/agent-console/commit/48896ece8f8dfe720d6a47ea900c9d2c9eb7f05f))
* **auth:** add pluggable auth adapters and middleware gate ([5bf6e72](https://github.com/deanzOo/agent-console/commit/5bf6e72ec1ef3586f89371c571aaccef4e7cef83))
* **config:** add validated env layer and feature gating ([6f1ffb0](https://github.com/deanzOo/agent-console/commit/6f1ffb0d9e98ed66bf71ee3a72b06844d626f9b2))
* **config:** authenticate agents with a claude subscription token ([6a95dbd](https://github.com/deanzOo/agent-console/commit/6a95dbd2f2f1863a9a42cef2ee663bf174926eab))
* **db:** add sqlite schema, connection, and settings layer ([47e5975](https://github.com/deanzOo/agent-console/commit/47e5975823d3bd4b135efb3718fd9324f7255dbe))
* **db:** move persistence to drizzle orm with derived zod schemas ([2d38c3f](https://github.com/deanzOo/agent-console/commit/2d38c3f05578e9ebd882d4061fe29d31cb85b63d))
* **deploy:** add docker image, compose stack, and systemd installer ([1c57b12](https://github.com/deanzOo/agent-console/commit/1c57b12dcf98e541623df49a0e4d984e8cdec0fc))
* extract the session host, and make the console installable ([#14](https://github.com/deanzOo/agent-console/issues/14)) ([b39b69b](https://github.com/deanzOo/agent-console/commit/b39b69b0c18a4ef13ba059ca21bfdd68d751b6d5))
* filter and search missions and issues ([#31](https://github.com/deanzOo/agent-console/issues/31)) ([86e6d8b](https://github.com/deanzOo/agent-console/commit/86e6d8b6307531b816b995ac9be579b802255f41))
* give agents the GitHub token so they can push and open PRs ([#56](https://github.com/deanzOo/agent-console/issues/56)) ([be7cb8e](https://github.com/deanzOo/agent-console/commit/be7cb8e86b26f66f767bb8c234c28fb6b54b1510))
* **mcp:** add github issues and asana task panels ([1f6dca9](https://github.com/deanzOo/agent-console/commit/1f6dca94ad25b463bf3a6c6657c1c305441026ba))
* **missions:** archive finished missions without discarding them ([#34](https://github.com/deanzOo/agent-console/issues/34)) ([7bf7686](https://github.com/deanzOo/agent-console/commit/7bf768671d0eae5b41612c07045d88d84768eaf4))
* **missions:** diff view, transcript asides, favicon, and resumable sessions ([#49](https://github.com/deanzOo/agent-console/issues/49)) ([ed5bbfb](https://github.com/deanzOo/agent-console/commit/ed5bbfb2a4958be72807348de9fee6d92655877b))
* **missions:** float a back-to-nav control over long transcripts ([#58](https://github.com/deanzOo/agent-console/issues/58)) ([2ae824a](https://github.com/deanzOo/agent-console/commit/2ae824a8c58f2fa72bd5e61ef1a0136040fbcace)), closes [#19](https://github.com/deanzOo/agent-console/issues/19)
* **missions:** stop a running agent, and throw away its files ([#42](https://github.com/deanzOo/agent-console/issues/42)) ([d2103bb](https://github.com/deanzOo/agent-console/commit/d2103bb2cd49020be370b00bb6aed83426ded9ad))
* nav counts, mission tabs, and talking to a running agent ([#48](https://github.com/deanzOo/agent-console/issues/48)) ([680b42b](https://github.com/deanzOo/agent-console/commit/680b42b7228b4dacfbfa8c76a870684ca56bed91))
* **notify:** alert on blocked, finished, and failed missions ([cfcb302](https://github.com/deanzOo/agent-console/commit/cfcb302a89806462955523f0d91d79100f129a3b))
* **setup:** add first-run wizard and password login ([fa53c89](https://github.com/deanzOo/agent-console/commit/fa53c89554136b76be3b05623f647c65b1d084b9))
* **tasks:** filter, search and page the task list ([#41](https://github.com/deanzOo/agent-console/issues/41)) ([a868056](https://github.com/deanzOo/agent-console/commit/a8680562f0c1b4462ace12344c30a1c8fca445e5))


### Bug Fixes

* **agents:** make the approval gate actually gate ([#10](https://github.com/deanzOo/agent-console/issues/10)) ([e53cfd7](https://github.com/deanzOo/agent-console/commit/e53cfd7d850fcbb38ec9af35b9bbaa0aa9b37177))
* **asana:** read tasks over REST, on an endpoint every plan has ([#43](https://github.com/deanzOo/agent-console/issues/43)) ([23ba69a](https://github.com/deanzOo/agent-console/commit/23ba69adf27dc547bd6c29c6823c483c032f83cb))
* branch missions from the remote's current tip, not the clone's ([#59](https://github.com/deanzOo/agent-console/issues/59)) ([5bac1b0](https://github.com/deanzOo/agent-console/commit/5bac1b025357c41f8270f42c27cf24e17b1677a9))
* **ci:** stop rejecting the sign-off dependabot puts on every commit ([#6](https://github.com/deanzOo/agent-console/issues/6)) ([97526c3](https://github.com/deanzOo/agent-console/commit/97526c37a1fcadb44ee2b1866871c72115cc365a))
* close undeliverable prompts, and show that sync is working ([#46](https://github.com/deanzOo/agent-console/issues/46)) ([9064415](https://github.com/deanzOo/agent-console/commit/9064415dcaa482191b4f5d88e2f51def7c2e43e0))
* **deploy:** let the published docker port be configured ([fcc7cc8](https://github.com/deanzOo/agent-console/commit/fcc7cc86b2b60c41e7ef2b676dede84d91380805))
* **docker:** install the toolchain better-sqlite3 needs to build ([4d7d433](https://github.com/deanzOo/agent-console/commit/4d7d4338a29c06ca4c9ff7dfe813b6397e5aa413))
* **docker:** stop chown -R stalling the build, and add gh ([#5](https://github.com/deanzOo/agent-console/issues/5)) ([1acc4a4](https://github.com/deanzOo/agent-console/commit/1acc4a4bf455c7e95646fdf622fb15928b13b895))
* end orphaned sessions, and filter tasks by workspace ([#44](https://github.com/deanzOo/agent-console/issues/44)) ([02fa7cd](https://github.com/deanzOo/agent-console/commit/02fa7cd035cbf16d3bdc3fbc99a1bbe53cf85404))
* mission status is wrong on screen, in two different ways ([#51](https://github.com/deanzOo/agent-console/issues/51)) ([18a544e](https://github.com/deanzOo/agent-console/commit/18a544e4d5e4f18bacc7e077198d8d281ccbc559))
* **missions:** a mission with a repository can actually start ([#37](https://github.com/deanzOo/agent-console/issues/37)) ([6ce6cc0](https://github.com/deanzOo/agent-console/commit/6ce6cc07029fdb607d50d0714c90d056be358544))
* **missions:** make the mission screen usable on a phone ([#40](https://github.com/deanzOo/agent-console/issues/40)) ([950c165](https://github.com/deanzOo/agent-console/commit/950c165ca484e9bc9b6cfb028daa779859778dde))
* **setup:** let a configured step be replaced ([#33](https://github.com/deanzOo/agent-console/issues/33)) ([c2c589f](https://github.com/deanzOo/agent-console/commit/c2c589fa0e3e80781a27acb92c0b4d09e47bbea6))
* **setup:** lower the password minimum to eight characters ([#15](https://github.com/deanzOo/agent-console/issues/15)) ([bb40434](https://github.com/deanzOo/agent-console/commit/bb40434ea33cb25e96fbd781b67f79bbf951923e))
* **setup:** refresh the nav, and reject a push contact that cannot work ([#17](https://github.com/deanzOo/agent-console/issues/17)) ([ac39b3a](https://github.com/deanzOo/agent-console/commit/ac39b3a622ad005e105cff010f64608692583cd0))
* **setup:** setting the password must not lock the wizard ([#16](https://github.com/deanzOo/agent-console/issues/16)) ([4ee5e00](https://github.com/deanzOo/agent-console/commit/4ee5e0015468f2d839fa9d1d07112dcd1210f86c))
* **sync:** stop syncing only the first ten repositories ([#35](https://github.com/deanzOo/agent-console/issues/35)) ([2c8282f](https://github.com/deanzOo/agent-console/commit/2c8282f99edaf8c250de1d775b5abd3c2800f17b))
* **web:** disable pinch-zoom to prevent broken layout in installed PWA ([#57](https://github.com/deanzOo/agent-console/issues/57)) ([b161edf](https://github.com/deanzOo/agent-console/commit/b161edf0a3e0b70222eac5fe193000fd177b4a6c)), closes [#20](https://github.com/deanzOo/agent-console/issues/20)
* **web:** guard the push toggle on window, not navigator ([#32](https://github.com/deanzOo/agent-console/issues/32)) ([6d3a8a4](https://github.com/deanzOo/agent-console/commit/6d3a8a41574100d111e6e8ca2dfe1421753a6692))
* **web:** keep the nav clear of the notch and rounded corners ([#62](https://github.com/deanzOo/agent-console/issues/62)) ([e8afb85](https://github.com/deanzOo/agent-console/commit/e8afb8583cd3b50ec83dc7b865ced81de6554a62))


### Refactors

* extract the framework-free core into a workspace package ([#12](https://github.com/deanzOo/agent-console/issues/12)) ([33bbce8](https://github.com/deanzOo/agent-console/commit/33bbce821f345997f522711f690d8f3df4036d8a))
* move the app layer into apps/web ([#13](https://github.com/deanzOo/agent-console/issues/13)) ([4b48935](https://github.com/deanzOo/agent-console/commit/4b48935bc64c844b5ed61d1b2616d624179f40e3))


### Documentation

* write the first-mission tutorial now that the loop works ([74310ae](https://github.com/deanzOo/agent-console/commit/74310aedde584aff4f8bff5120720c9d2d426417))
