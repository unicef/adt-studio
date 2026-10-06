# Implementação local — GPT-6.1 Sol

Data: 2026-10-05. Sem commits, issue, PR, release ou alterações em livros reais.
Implementação do [plano](GPT-6.1-SOL-IMPLEMENTATION-PLAN.md), com avaliação e
execução dos testes reservadas ao autor conforme sua orientação nesta sessão.

## Mudanças

- Defaults distribuídos de texto/conversão e do provider OpenAI usam
  `openai:gpt-6.1-sol`. Fallbacks de quizzes, revisão visual, segmentação manual,
  feedback de atividades e preparação textual de TTS usam a constante comum.
- Seleções explícitas continuam tendo precedência. Foram preservados os modelos
  de imagem, síntese e transcrição de áudio, o modelo mini independente do
  book-outline, o juiz de tradução e o fallback de agente fixado em GPT-5.5.
- Foram adicionadas 43 variantes em `prompts/openai_gpt_6_1_sol/`, mantendo os
  nomes, variáveis, tags, includes e contratos dos prompts existentes. Os
  prompts-base GPT-5.4 e `DEFAULT_BASE_PROMPT_MODEL_ID` permanecem intactos.
- API e Studio reconhecem Sol para seleção de modelos e edição/versionamento
  de prompts. O lookup existente permanece: variante global precede edição-base
  de um livro; uma edição específica de Sol no livro pode sobrepor a global.
- Sol usa Responses em todas as estratégias estruturadas e nos agentes. A
  implementação envia `low` para effort omitido, `none` ou `minimal` e preserva
  `low`, `medium`, `high`, `xhigh` e `max` explícitos, sem regravar configurações.
  Nenhum parâmetro de sampling ou logprobs é enviado ao Sol. Esses requisitos
  são descritos na [documentação oficial do modelo](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
- O SDK instalado (`ai` 4 / `@ai-sdk/openai` 1.3.24) não reconhece GPT-6 como
  reasoning e não conserva todos os itens de continuação. Um adapter REST
  específico para Sol evita atualizar o SDK compartilhado e suas integrações.
  Nenhuma dependência foi adicionada ou atualizada.
- Reasoning opaco, IDs de chamadas e resultados de ferramentas são preservados
  no transcript/cache do livro e reenviados entre turnos. Requests usam
  `store: false` e incluem reasoning criptografado para continuação sem estado
  remoto, conforme o [guia de reasoning](https://developers.openai.com/api/docs/guides/reasoning).
- O cache inclui effort efetivo e fingerprint do adapter/endpoint. Sol não lê
  entradas legadas sem essa identidade. Caches anteriores não são removidos.
- Os registros incluem modelo solicitado/retornado, prompt e caminho
  resolvidos, endpoint, effort, requests/respostas e tentativas de reparo.
  Imagens são representadas por hashes/metadados; headers e chaves não são
  registrados. Tokens de reasoning já incluídos em output não são somados
  novamente. Uso de tentativas rejeitadas é conservado; hits locais de agente
  não geram novo uso faturável. Não existe estimador monetário novo nesta mudança.

## Verificação estática executada

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | Passou após os ajustes finais de código. |
| `pnpm lint` | Passou; 8 warnings de suppressions preexistentes em arquivos não alterados. |
| `git diff --check` | Passou; avisos de normalização LF/CRLF do Git no Windows. |

Não foram adicionadas mensagens traduzíveis no Studio; não foi necessário
executar Lingui extract nem modificar catálogos. `pnpm lint:invariants` continua
planejado e não foi executado.

## Testes preparados, não executados

Os novos testes têm títulos `AC-n:` e cobrem defaults/seleções explícitas,
requests multimodais, schemas e nullable opcionais, fallback por ferramenta,
effort, reparo, cancelamento/timeouts, indisponibilidade sem substituição,
segregação do cache, inspeção/uso e continuação de agentes com replay do cache.
Também foram preparados testes de lookup/versionamento de prompts e de leitura
de livro sem alterar IDs, edições, versões ou conclusão das etapas.

Os testes existentes que afirmavam o default distribuído GPT-5.4 foram ajustados;
uma revisão complementar corrigiu as expectativas herdadas em metadata,
book-summary, page-sectioning e web-rendering, e vinculou o payload de defaults
do registry ao modelo declarado pelo provider. O teste de validação de config
também afirma explicitamente o fallback Sol.
Fixtures e seleções explícitas GPT-5.4 foram mantidas. AC-1 a AC-4 ainda precisam
da execução das suites e do smoke real pelo autor. AC-5 não foi avaliado: nenhuma
conversão real, comparação de 30–50 páginas, avaliação visual/acessível, medição
de latência ou custo foi feita. A mudança não implica aprovação para release.

Comando sugerido ao autor para as áreas diretamente afetadas (não executado):

```powershell
pnpm test packages/llm/src/__tests__ packages/types/src/__tests__/config.test.ts packages/pipeline/src/__tests__ apps/api/src/routes/books.test.ts apps/api/src/routes/providers.test.ts apps/api/src/routes/presets.test.ts apps/api/src/routes/prompts.test.ts apps/studio/src/hooks/use-effective-default-model.test.ts apps/studio/src/components/pipeline/components/PromptViewer/promptModel.test.ts
```

### Revisão das duas falhas relatadas pelo autor

O autor relatou 3.795 testes aprovados e duas falhas. A investigação local
identificou premissas incorretas nos dois testes, sem necessidade de alterar
o código de produção:

- `codex-login.test.ts` simulava macOS, mas comparava o candidato gerado por
  `node:path.join` no Windows com um caminho literal POSIX. A fixture agora
  usa o caminho nativo do host, como os demais testes de descoberta. O fallback
  Homebrew e a exigência de encontrar o executável continuam sendo verificados.
- `book-outline.test.ts` ainda tratava GPT-5.4 como default distribuído.
  A cobertura agora exige GPT-5.4-mini tanto com default omitido quanto com
  Sol herdado, preserva GPT-5.4 selecionado explicitamente na configuração
  geral e verifica seu override de step mesmo quando o default é Sol.

As suites não foram reexecutadas pelo agente; a nova execução permanece com
o autor, conforme combinado. Não foram feitos commits.

A consulta de duplicatas no GitHub não foi concluída: a chamada local foi
bloqueada pela rede, e o escalonamento solicitado não foi autorizado. A consulta
permanece pendente antes de abrir qualquer issue/PR.
