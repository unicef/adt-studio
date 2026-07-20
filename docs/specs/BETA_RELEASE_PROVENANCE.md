# Proveniência de versões beta: PR, branch, commit e mudanças no browser de versões

> **Status:** implementado em 2026-07-20.
> Revisão validada contra o código em 2026-07-20 (branch `fix/beta-version-updates`).

## Correções aplicadas nesta revisão

1. **[Crítico] Permissões do job `finalize`** — o job declara apenas `contents: write` (`.github/workflows/release.yml:301-302`); com `permissions` explícito, todo o resto vira `none`. As chamadas `gh api repos/.../pulls/N` e `.../commits/.../pulls` falhariam com 403 **em todo release**, e o try/catch mascararia isso — o card sairia sempre sem PRs. Adicionado `pull-requests: read`.
2. **[Bug de design nos testes] O parse não era alcançável pelo teste proposto** — `parseGitHubRelease` é privada e só é chamada no caminho de rede (`requestGitHubReleases`); `createBetaReleaseCatalog` recebe `GitHubRelease[]` já prontos (o teste atual constrói fixtures direto, `release-catalog.test.ts:11-25`). O round-trip "no nível do catálogo" nunca exercitaria o parse. Corrigido: exportar `parseGitHubRelease` e testá-la diretamente.
3. **[Afirmação incorreta] `normalizeReleaseNotes` recebe HTML, não markdown** — o canal normal de update usa o provider `github` do electron-updater (`electron-builder.js:129-133`), que entrega `releaseNotes` como **HTML** renderizado do feed atom (é por isso que `ReleaseNotesMarkdown.normalizeImages` já trata `<picture>`/`<img>`). Passar por `parseReleaseSourceSection` (markdown) não removeria a seção nesse caminho — nem para betas via auto-check. Corrigido: helper `stripReleaseSourceSection` que remove a cauda nas duas formas (heading markdown **ou** `<h3>Release source</h3>` renderizado).
4. **[Robustez] Fallback no workflow** — se o compose crashar, o release sairia sem notas nenhuma. Adicionado fallback para `--generate-notes` quando `release-notes.md` estiver vazio/ausente.
5. **Endurecimentos menores** — parse ancorado na **última** ocorrência do heading; patterns exatos para distinguir commits de controle de commits reais; exclusão explícita de tags staging (`X.Y.Z-beta-<pr>`) em `resolvePreviousTag` como comportamento, não só como teste.
6. **[Crítico] Tag anterior agora respeita canal e ancestralidade** — ordenar todas as tags apenas por SemVer é incorreto neste repositório: promoções `develop` → `main` usam squash, então uma tag estável e a beta mais recente podem estar em histórias divergentes. `resolvePreviousTag` agora recebe o SHA fonte e considera apenas tags ancestrais desse SHA (`git merge-base --is-ancestor`); para beta, prefere a beta numerada ancestral mais recente e usa uma estável ancestral apenas como fallback. A tag alvo, staging, RCs e tags não ancestrais ficam fora.
7. **[Crítico] Proveniência aponta para o commit realmente compilado** — `TRIGGER_SHA` (`github.sha`) é preservado como `buildCommit` e nunca é substituído pelo pai: é esse SHA que os jobs `desktop` e `docker` recebem no checkout. Um `changeCommit` opcional pode apontar para o pai quando o build foi disparado por um commit de controle `RELEASE: ...` ou quando um `workflow_dispatch` parte exatamente de um `chore(release): v... [skip ci]`; os dois conceitos não são mais confundidos.
8. **[Ordem do workflow] Composição antes da criação da tag** — o endpoint `releases/generate-notes` aceita uma tag ainda inexistente quando `target_commitish` é informado. O compose passa `target_commitish=$TRIGGER_SHA` e roda antes de "Commit release metadata and push tag", evitando publicar a tag antes de a composição terminar e fazendo as notes descreverem o mesmo snapshot usado pelos builds.
9. **[Fallback atômico] Arquivo parcial nunca é aceito** — o script monta toda a saída em memória e só então escreve uma vez no stdout. O workflow redireciona para `release-notes.tmp` e só renomeia para `release-notes.md` quando o comando termina com sucesso e o arquivo não está vazio; em qualquer falha remove ambos e `gh release create --generate-notes` permanece como fallback.
10. **[Escopo] Primeira implementação restrita a betas** — o step de composição roda somente quando `needs.prepare.outputs.prerelease == 'true'`. Releases estáveis de `main` não recebem a seção `### Release source`, não usam o novo resolver e continuam no caminho atual de `gh release create --generate-notes`. Isso reduz o risco sem retirar funcionalidade do `BetaVersionsView`, que só lista betas.

## Contexto

As versões beta são cortadas de `develop` logo após merges de PRs, mas hoje o app não mostra de onde cada beta veio — o `BetaVersionsView` exibe apenas versão, data, tamanho e as release notes auto-geradas. O objetivo é embutir metadados de proveniência (PR(s) de origem, branch, commit exato usado pelo build, última mudança opcional e link de comparação) nas release notes no momento do release (CI) e exibi-los como um card estruturado no browser de versões beta.

**Decisão-chave de formato:** os metadados serão uma **seção markdown visível** (`### Release source`) anexada **sempre ao fim** das notes — *não* um comentário HTML com JSON. Verificado: `ReleaseNotesMarkdown.parseBlocks` (linha 135) renderiza qualquer linha desconhecida como parágrafo, então um comentário HTML apareceria como texto cru em apps beta já instalados. A seção visível degrada bem (apps antigos a renderizam como heading + lista com links; o GitHub web também) e o app novo faz parse, remove a seção e renderiza o card. Ser sempre a última seção do corpo é parte do contrato — permite o strip "do marcador até o fim" no caso HTML (ver etapa 4).

## Formato embutido (gerado pelo CI, parseado pelo app)

```markdown
### Release source

- Branch: `develop`
- Built from: [`1a2b3c4`](https://github.com/unicef/adt-studio/commit/<build-sha>) RELEASE: beta
- Last change: [`9f8e7d6`](https://github.com/unicef/adt-studio/commit/<change-sha>) fix: correct page splitting
- PR [#123](https://github.com/unicef/adt-studio/pull/123) `feat/page-split` → `develop` by @alice — Fix page splitting on RTL books
- Compare: [v0.7.5-beta.1...v0.7.5-beta.2](https://github.com/unicef/adt-studio/compare/v0.7.5-beta.1...v0.7.5-beta.2)
```

Gramática por linha, com regexes ancoradas; campos livres (título do PR, subject do commit) sempre no fim da linha para não quebrar o parse (PR titles não podem conter newline, então injeção de heading via título é impossível); URLs só aceitas se começarem com `https://github.com/`. Shape parseado:

```ts
interface ReleaseSourcePullRequest { number: number; url: string; headRef?: string; baseRef?: string; author?: string; title?: string }
interface ReleaseSource {
  branch?: string
  buildCommit?: { sha: string; url: string; subject?: string }
  changeCommit?: { sha: string; url: string; subject?: string }
  prs: ReleaseSourcePullRequest[]
  compare?: { label: string; url: string }
}
```

## Etapas

### 1. Módulo compartilhado de formato/parse (o contrato)

- **Novo `scripts/release-source-notes.mjs`** (puro, sem I/O):
  - `formatReleaseSourceSection(source)` → seção markdown (omite linhas ausentes; `""` se vazio).
  - `parseReleaseSourceSection(body)` → `{ notes, source | undefined }` — localiza a **última** ocorrência do heading (hardening contra colisão com conteúdo das notes), parseia as bullets contíguas, remove a seção; tolerante a linhas desconhecidas, CRLF e seção ausente/corrompida (retorna `source: undefined` sem quebrar).
  - `stripReleaseSourceSection(body)` → `string` — remove a seção em **qualquer das duas formas**: heading markdown (delegando ao parse) **ou** a forma HTML renderizada pelo feed do GitHub (`<h3>Release source</h3>` até o fim do corpo — válido porque a seção é, por contrato, sempre a última). Usada pelo caminho do electron-updater (etapa 4), onde as notes chegam como HTML.
- **Novo `scripts/release-source-notes.d.mts`** (espelha o padrão de `scripts/release-version.d.mts`), exportando também os tipos `ReleaseSource`/`ReleaseSourcePullRequest`.
- **Novo `scripts/release-source-notes.test.mjs`** — round-trip format→parse; strip preservando o resto das notes; linhas malformadas; URLs hostis; títulos com `—`/backticks; CRLF; heading duplicado (usa o último); `stripReleaseSourceSection` nas formas markdown e HTML.
- Verificado: o main process já importa de `@root/scripts/*.mjs` (alias em `apps/desktop/tsconfig.node.json:14` e `electron.vite.config.ts:11`; o projeto `desktop` do vitest raiz também tem o alias), e o projeto `main-scripts` do vitest raiz já roda `scripts/**/*.test.mjs` — CI e app usam o MESMO módulo.

### 2. Script de composição das notes no CI

- **Novo `scripts/compose-release-notes.mjs`** — env: `GH_TOKEN`, `REPO`, `TAG`, `BRANCH`, `TRIGGER_SHA`; compõe o corpo inteiro em memória e faz uma única escrita no stdout somente no fim. Fluxo:
  1. Commit do build: validar que `TRIGGER_SHA` é um commit existente e usá-lo, sem substituição, como `buildCommit`. Esse é o SHA exato recebido pelos checkouts dos jobs `desktop` e `docker`. Resolver `changeCommit` separadamente: somente se o subject do build casar exatamente com `^RELEASE:\s*(major|minor|patch|beta|beta-minor|beta-major)\s*$` ou `^chore\(release\):\s+v[^ ]+\s+\[skip ci\]$`, usar o pai; caso contrário, omitir `changeCommit` porque ele seria igual ao build.
  2. Tag anterior via `resolvePreviousTag(tags, targetTag, sourceSha, isAncestor)`. O helper é chamado apenas para releases beta, usa `parseReleaseTag`/`compareReleaseVersions`, exclui a própria tag alvo, staging (`X.Y.Z-beta-<pr>`), RCs e qualquer tag para a qual `git merge-base --is-ancestor <tag> <sourceSha>` falhe. Escolhe a beta **numerada** ancestral mais recente e cai para a estável ancestral mais recente somente se não houver beta. `isAncestor` é injetável nos testes para manter a decisão unit-testable sem criar repositórios temporários.
  3. Números de PR: subjects de `git log $PREV..$TRIGGER_SHA` (merge commits `Merge pull request #N` e squash `(#N)` no fim do subject), cap em 10; fallback `gh api repos/$REPO/commits/$TRIGGER_SHA/pulls` quando nenhum for encontrado. Quando o cap corta PRs, o link Compare cobre o restante (documentar no código do formatter que a lista pode ser parcial).
  4. Detalhe de cada PR: `gh api repos/$REPO/pulls/$N` (number, title, html_url, head/base ref, author, merged_at; pula não-merged, tolera 404; fork → `head.label`).
  5. Notes geradas: `gh api -X POST repos/$REPO/releases/generate-notes -f tag_name=$TAG -f target_commitish=$TRIGGER_SHA [-f previous_tag_name=$PREV] --jq .body`. A tag ainda não existe; conforme o contrato do endpoint, `target_commitish` define o endpoint do range usado para gerar as notes. Usar o SHA, não `BRANCH`, impede que commits enviados durante os builds entrem nas notes. O workflow continua criando a tag depois, sobre o commit de metadados, como faz hoje.
  6. Saída: notes geradas + `\n\n` + `formatReleaseSourceSection(...)`.
  - **Falha de proveniência nunca bloqueia o release**: try/catch por passo de metadados → emite só as notes geradas com warning no stderr. Se até o `generate-notes` falhar, o script não escreve stdout e sai com código ≠ 0; o workflow descarta o temporário e cai no fallback `--generate-notes` (etapa 3).
- **Novo `scripts/compose-release-notes.test.mjs`** — `resolvePreviousTag` (beta ancestral versus stable divergente; fallback para stable ancestral; exclusão da tag alvo, staging `-beta-123`, RC e tags não ancestrais; sem tags), `extractPullRequestNumbers` (merge/squash/misto/cap) e `resolveLastChangeCommit` (patterns exatos de `RELEASE:`/`chore(release)`, subjects apenas parecidos não são pulados). Teste adicional garante que uma falha antes da conclusão produz stdout vazio.

### 3. `.github/workflows/release.yml` (job `finalize`)

- **Adicionar `pull-requests: read` às `permissions` do finalize** (hoje só `contents: write`, linha 301-302 — com permissions explícito o resto vira `none` e as chamadas `gh api .../pulls` falhariam com 403 em todo release, silenciosamente por causa do try/catch).
- Checkout com `fetch-depth: 0` (hoje é o default shallow — necessário para `listGitTags()`, os testes de ancestralidade e `git log $PREV..$TRIGGER_SHA`; a própria mensagem de erro de `listGitTags` já recomenda isso).
- Adicionar `actions/setup-node@v4` (node 22) ao finalize, sem cache — mesmo racional do `prepare` (scripts dependency-free, sem `pnpm install`).
- Novo step "Compose beta release notes" **antes** de "Commit release metadata and push tag", com `if: needs.prepare.outputs.prerelease == 'true'`: a API gera notes para uma tag nova usando `target_commitish=$TRIGGER_SHA`. Passar `GH_TOKEN`, `TAG`, `REPO`, `BRANCH: ${{ github.ref_name }}`, `TRIGGER_SHA: ${{ github.sha }}` e usar publicação atômica do arquivo:
  ```bash
  rm -f release-notes.tmp release-notes.md
  if node scripts/compose-release-notes.mjs > release-notes.tmp && [ -s release-notes.tmp ]; then
    mv release-notes.tmp release-notes.md
  else
    rm -f release-notes.tmp release-notes.md
    echo "::warning::Could not compose release notes; gh release create will generate them."
  fi
  ```
- Em "Create GitHub release": começar sempre com `NOTES_ARGS=(--generate-notes)` e substituir por `NOTES_ARGS=(--notes-file release-notes.md)` somente quando o release for prerelease **e** `[ -s release-notes.md ]`; passar `"${NOTES_ARGS[@]}"` ao `gh release create`. O tag já existe nesse ponto, portanto o fallback preserva exatamente o comportamento atual. Releases estáveis nunca têm `release-notes.md` composto e continuam usando `--generate-notes` sem qualquer mudança de comportamento.

### 4. Processo main do Electron (parse + strip)

- **`apps/desktop/src/main/services/release-catalog.ts`**: importar `parseReleaseSourceSection` + `type ReleaseSource` de `@root/scripts/release-source-notes.mjs`; adicionar `source?: ReleaseSource` a `GitHubRelease` e `AvailableRelease` (`BetaRelease` herda); em `parseGitHubRelease`, parsear o `body` → `releaseNotes` recebe as notes já sem a seção, `source` recebe o objeto; propagar `source` em `createBetaReleaseCatalog`. **Exportar `parseGitHubRelease`** — hoje é privada e só chamada no caminho de rede, então sem exportá-la o parse ficaria fora do alcance dos testes (o teste atual constrói `GitHubRelease` fixtures direto).
- **`apps/desktop/src/main/services/auto-updater.ts`**: `listAvailableVersions` já repassa campos extras via rest-spread (verificado, linhas 220-224 — sem mudança); em `normalizeReleaseNotes`, passar o resultado por `stripReleaseSourceSection(...)` — **não** por `parseReleaseSourceSection().notes`: o canal normal usa o provider `github` do electron-updater, que entrega as notes como **HTML** do feed atom (não markdown), então só o strip de duas formas cobre esse caminho. O fallback `?? activeBetaRelease?.releaseNotes` já vem limpo do catálogo.
- Preload (`index.ts`/`index.d.ts`) não muda — reexporta tipos do auto-updater (verificado).
- **`release-catalog.test.ts`**: testes de `parseGitHubRelease` com body construído via `formatReleaseSourceSection` importado (trava o round-trip real CI→app); asserts de `source` e de que `releaseNotes` não contém mais "Release source"; payloads sem seção intocados; propagação de `source` em `createBetaReleaseCatalog`.

### 5. Tipos do renderer

- **`apps/studio/src/vite-env.d.ts`**: espelhar manualmente `ElectronReleaseSource`/`ElectronReleaseSourcePullRequest`/commit e adicionar `source?` a `ElectronAvailableRelease` (linha 88 — verificado). Hooks não mudam (`AvailableRelease` é alias em `use-update-status.ts:5` — verificado). O espelhamento manual é o padrão já estabelecido e respeita a regra de camadas (studio não importa de `scripts/`).

### 6. UI — card de origem

- **Novo `apps/studio/src/components/updates/ReleaseSourceCard.tsx`**: card (`rounded-lg border bg-muted/30 px-4 py-3`) com heading `<Trans>Source</Trans>` e linhas:
  - PRs: ícone `GitPullRequest`, link externo `#123 · título`; linha secundária `GitBranch` com `headRef → baseRef` e autor.
  - Build: `GitCommitHorizontal` (verificado no d.ts do lucide-react 0.469.0 instalado: `GitCommitHorizontal`, `GitPullRequest`, `GitBranch` e `GitCompareArrows` existem; `GitCommit` não), label `<Trans>Built from</Trans>`, sha curto (7 chars) linkado + subject truncado. Quando `changeCommit` existir e diferir, exibir abaixo como `<Trans>Last change</Trans>`; nunca apresentar esse SHA como o commit compilado.
  - Fallback só-branch quando não há PRs.
  - Compare: `GitCompareArrows` + link `<Trans>View all changes</Trans>`.
  - Links: mesmo padrão de `ReleaseNotesMarkdown.renderInline` — `window.open(href, "_blank", "noopener,noreferrer")`; renderizar como link só se `href.startsWith("https://github.com/")` (defesa em profundidade além do filtro no parse).
  - Todas as strings via macros Lingui (inclusive aria-labels com `` t`...` ``).
- **`BetaVersionsView.tsx`**: dentro da região rolável de detalhes (div `border-y px-5 py-4`, linha 233 — verificado), acima do heading "Release notes": `{selected.source && <ReleaseSourceCard source={selected.source} />}`. Sem `source` (releases antigas) → nada renderiza.
- **`BetaVersionsView.test.tsx`** (existe — verificado): fixture com `source` como objeto literal (o round-trip format→parse é coberto nos testes do desktop; o studio não importa de `scripts/`); asserts do link do PR, branch, compare; `window.open` stubado com `vi.fn()`; ausência do card sem `source`.

### 7. i18n

- `pnpm --filter @adt/studio extract` e preencher os novos msgids em **todas** as 5 locales (`en`, `pt-BR`, `es`, `fr`, `sq`) — nenhum `msgstr` vazio (CI enforça). Atenção: o branch atual (`fix/beta-version-updates`) já tem `.po` modificados no working tree — fazer o extract por cima desse estado.

### 8. Docs

- **`docs/RELEASING.md`**: subseção "Beta release provenance" documentando que a composição se aplica somente a prereleases beta, a gramática exata da seção `### Release source` (avisar para não editar essa seção à mão no corpo dos releases — e que ela deve permanecer a última seção do corpo), o parse/strip pelo app, o fallback `--generate-notes` e o fato de releases estáveis permanecerem inalterados.

## Riscos e casos de borda (endereçados no design)

- Apps antigos: renderizam a seção como markdown normal (motivo da escolha do formato).
- Releases estáveis: o step de composição é pulado por condição do workflow; não recebem `### Release source` e seguem usando somente `--generate-notes`.
- Canal de auto-update (provider `github`): notes chegam como HTML → coberto por `stripReleaseSourceSection` de duas formas; se o strip HTML falhar num formato inesperado de feed, a degradação é a seção visível (legível por design), nunca texto quebrado novo — o comportamento atual do app com HTML nas notes já é esse.
- `workflow_dispatch` / primeiro release sem tag anterior / push direto sem PR / head em `chore(release)`: `buildCommit` continua sendo o SHA exato compilado; `changeCommit` é apenas contexto opcional; o script degrada os demais campos individualmente (sem linha Compare, PRs via API do commit, card só com build/branch).
- Histórias `develop`/`main` divergentes por squash: somente tags ancestrais e do canal correto participam do range; se nenhuma existir, omite `previous_tag_name` e Compare em vez de fabricar um range incorreto.
- Compose crasha por completo ou depois de montar apenas parte do conteúdo: stdout é emitido uma vez pelo script e o workflow só promove o arquivo temporário após sucesso; qualquer falha deixa `release-notes.md` ausente e ativa `--generate-notes`.
- Rate limit: ≤ ~12 chamadas `gh api` por release (orçamento de 1.000/h do `GITHUB_TOKEN`).
- Seção editada/corrompida à mão: parser defensivo → `source: undefined`, texto segue como markdown comum.
- Tags staging `-beta-<pr>`: excluídas de `resolvePreviousTag`.

## Verificação

1. `pnpm vitest run` (cobre `scripts/**/*.test.mjs`, desktop e studio), `pnpm typecheck`, `pnpm lint` (o ESLint do Lingui pega strings não traduzidas).
2. `pnpm --filter @adt/studio extract` + conferir ausência de `msgstr ""` novos nas 4 locales não-en.
3. Dry-run local do compose: `GH_TOKEN=$(gh auth token) REPO=unicef/adt-studio TAG=<próxima-tag-ainda-inexistente> BRANCH=develop TRIGGER_SHA=<sha-exato-a-compilar> node scripts/compose-release-notes.mjs` e inspecionar a seção emitida. Confirmar que `Built from` aponta exatamente para `TRIGGER_SHA` e que a tag anterior escolhida é ancestral desse SHA.
4. Fim a fim: cortar um beta real (`RELEASE: beta` em develop), inspecionar o corpo do GitHub Release, abrir "Beta versions" num build beta empacotado (e num beta antigo instalado, para confirmar degradação graciosa) e verificar card, links externos e notes sem a seção. **Adicionalmente**: disparar um check de update pelo canal normal num build beta e confirmar que o banner de update não mostra a seção (valida o strip da forma HTML).

## Sequência sugerida de commits

1. `release-source-notes.mjs` + d.mts + testes → 2. `compose-release-notes.mjs` + testes → 3. `release.yml` (permissions + fetch-depth + compose + fallback) → 4. main process + testes → 5. tipos + `ReleaseSourceCard` + view + testes → 6. i18n → 7. docs. (App e CI podem ser mergeados em qualquer ordem — o parser tolera seção ausente e apps antigos toleram a seção nova.)
