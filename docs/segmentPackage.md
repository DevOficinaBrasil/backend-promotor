# @obcrm/segmentation

Pacote reutilizavel com o nucleo da logica de segmentacao do OBCRM.

## Objetivo

Este pacote centraliza a logica de segmentacao para reuso entre aplicacoes.

Ele fornece:

- Contrato DSL para definir regras de segmento
- Validacao de regras
- Avaliacao de regra em runtime (por contexto)
- Compilacao SQL para preview/contagem com metadata de compatibilidade
- Componentes internos de Specification Pattern para uso avancado

## Exports publicos

### API principal (recomendada)

- Tipos de DSL e contexto de segmentacao
- Catalogo de criterios e validadores de operadores
- SegmentValidator para validacao de definicoes
- SegmentEvaluator para avaliacao em tempo real (contextual)
- SegmentQueryCompiler para geracao de query SQL de preview/contagem
- buildSegmentEvaluationHash para rastreabilidade de decisao

### API avancada (opcional)

- SegmentBehaviorCriterionCompiler
- DslToSpecificationParser
- RuntimeEvaluationVisitor
- SqlCompilationVisitor
- LegacyBehaviorAdapter
- Tipos internos de specification (Specification, SpecificationCapability, SqlCompilationResult)

## Build local

```bash
npm run build
```

## Instalacao

```bash
npm install @obcrm/segmentation
```

## Uso na aplicacao consumidora

```ts
import {
  SegmentValidator,
  SegmentEvaluator,
  SegmentQueryCompiler,
  type SegmentVersionSnapshot,
  type SegmentEvaluationContext
} from "@obcrm/segmentation";
```

## Segment Builder (fluent API)

Para facilitar criacao de regras sem montar JSON manualmente, use SegmentDslBuilder.

```ts
import {
  SegmentDslBuilder,
  SegmentEvaluator,
  type SegmentVersionSnapshot,
  type SegmentEvaluationContext
} from "@obcrm/segmentation";

let dynamicRuleDefinition = SegmentDslBuilder
  .create()
  .when( SegmentDslBuilder.equals( "contact.activeFlag", true ) )
  .and( SegmentDslBuilder.gte( "orchestration.priority", 5 ) )
  .thenInclude( "segment_rule_matched" )
  .defaultExclude( "default_exclude" )
  .build();

let evaluator = new SegmentEvaluator();

let segmentVersion: SegmentVersionSnapshot = {
  id: "segment-version-id",
  tenantId: 1,
  segmentId: "segment-id",
  segmentKey: "high-value-contact",
  segmentType: "dynamic",
  versionNumber: 1,
  status: "published",
  ruleDefinition: dynamicRuleDefinition,
  createdAt: new Date().toISOString()
};

let context: SegmentEvaluationContext = {
  tenantId: 1,
  event: {
    eventId: "event-id",
    type: "test",
    occurredAt: new Date().toISOString(),
    payload: {}
  },
  contact: {
    id: "contact-id",
    externalUserId: 10,
    activeFlag: true
  },
  preference: null,
  orchestration: {
    channel: "email",
    category: "marketing",
    templateKey: "template-key",
    priority: 5
  }
};

let decision = evaluator.evaluate( segmentVersion, context );
```

## Preview remoto e opcoes de filtro (CRM API)

Definicoes criadas via SegmentDslBuilder agora incluem operacoes remotas:

- dynamicRuleDefinition.preview( ... )
- dynamicRuleDefinition.listFilterOptions( ... )

Por padrao, as chamadas usam CRM_API_URL do ambiente da aplicacao consumidora.

```ts
import {
  SegmentDslBuilder
} from "@obcrm/segmentation";

let dynamicRuleDefinition = SegmentDslBuilder
  .create()
  .when( SegmentDslBuilder.equals( "contact.activeFlag", true ) )
  .and( SegmentDslBuilder.gte( "orchestration.priority", 5 ) )
  .thenInclude( "segment_rule_matched" )
  .defaultExclude( "default_exclude" )
  .build();

let preview = await dynamicRuleDefinition.preview(
  {
    tenantId: 5,
    limit: 20,
    includeEstimatedCount: false,
    accessToken: process.env.CRM_API_TOKEN
  }
);

let filterOptions = await dynamicRuleDefinition.listFilterOptions(
  {
    tenantId: 5,
    attributeLimit: 100,
    tagLimit: 200,
    accessToken: process.env.CRM_API_TOKEN
  }
);
```

### Configuracao de ambiente

```env
CRM_API_URL=https://adshomolog.oficinabrasil.com.br
```

Observacoes:

- O metodo preview envia POST para /api/automacao/internal/segments/preview.
- O metodo listFilterOptions envia GET para /api/automacao/internal/segments/filter-options.
- Voce pode sobrescrever a URL por chamada com crmApiUrl.
- Voce pode enviar headers extras com headerByNameMap.

## Contrato principal (DSL)

O formato DSL JSON continua sendo o contrato principal e recomendado para integracao entre aplicacoes.

Operadores DSL suportados na arvore condicional:

- equals
- in
- gt
- gte
- lt
- lte
- exists
- and
- or
- not
- behavior

Exemplo:

```ts
import {
  SegmentEvaluator,
  type SegmentEvaluationContext,
  type SegmentVersionSnapshot
} from "@obcrm/segmentation";

let evaluator = new SegmentEvaluator();

let segmentVersion: SegmentVersionSnapshot = {
  id: "segment-version-id",
  tenantId: 1,
  segmentId: "segment-id",
  segmentKey: "high-value-contact",
  segmentType: "dynamic",
  versionNumber: 1,
  status: "published",
  ruleDefinition: {
    if: {
      and: [
        { equals: [ "contact.activeFlag", true ] },
        { gte: [ "orchestration.priority", 5 ] }
      ]
    },
    then: {
      decision: "include",
      reason: "segment_rule_matched"
    },
    default: {
      decision: "exclude",
      reason: "default_exclude"
    }
  },
  createdAt: new Date().toISOString()
};

let context: SegmentEvaluationContext = {
  tenantId: 1,
  event: {
    eventId: "event-id",
    type: "test",
    occurredAt: new Date().toISOString(),
    payload: {}
  },
  contact: {
    id: "contact-id",
    externalUserId: 10,
    activeFlag: true
  },
  preference: null,
  orchestration: {
    channel: "email",
    category: "marketing",
    templateKey: "template-key",
    priority: 5
  }
};

let decision = evaluator.evaluate( segmentVersion, context );
```

## Exemplo de validacao (obrigatorio antes de publicar regra)

```ts
import {
  SegmentValidator,
  type SegmentVersionDefinition
} from "@obcrm/segmentation";

let validator = new SegmentValidator();

let definition: SegmentVersionDefinition = {
  if: {
    equals: [ "contact.activeFlag", true ]
  },
  then: {
    decision: "include",
    reason: "active_contact"
  },
  default: {
    decision: "exclude",
    reason: "default_exclude"
  }
};

let validation = validator.validateDefinition( "dynamic", definition );

if ( validation.valid )
{
}
else
{
  throw new Error( `invalid_segment_definition: ${ validation.errorArray.join( "; " ) }` );
}
```

## Exemplo de segmento estatico

Para segmento estatico, o pacote valida o contrato, mas a manutencao de membership (lista de contatos) ocorre na aplicacao consumidora.

```ts
import {
  SegmentValidator,
  type SegmentVersionDefinition
} from "@obcrm/segmentation";

let validator = new SegmentValidator();

let staticDefinition: SegmentVersionDefinition = {
  membershipMode: "static"
};

let validation = validator.validateDefinition( "static", staticDefinition );
```

## Compilacao SQL de preview/contagem

```ts
import {
  SegmentQueryCompiler,
  type SegmentDynamicDsl
} from "@obcrm/segmentation";

let compiler = new SegmentQueryCompiler();

let definition: SegmentDynamicDsl = {
  if: {
    behavior: {
      section: "LEAD_DATA",
      criterion: "TAG",
      value: {
        operator: "HAS_TAG",
        tagKeyArray: [ "vip" ]
      }
    }
  },
  then: {
    decision: "include"
  },
  default: {
    decision: "exclude",
    reason: "default_exclude"
  }
};

let preview = compiler.compilePreviewQuery(
  {
    tenantId: 1,
    definition,
    limit: 100
  }
);

let sqlCompilable = preview.capability?.sqlCompilable === true;
let nonSqlReasonArray = preview.capability?.nonSqlReasonArray ?? [];
```

### Campo capability no preview

compilePreviewQuery retorna capability para orientar fallback:

- runtimeEvaluable: indica se a regra pode ser avaliada no runtime
- sqlCompilable: indica se a regra foi totalmente compilada para SQL
- nonSqlReasonArray: lista de motivos quando houver incompatibilidade SQL

Isso permite decidir, por exemplo, entre usar preview SQL direto ou fallback para outro caminho de avaliacao.

## API programatica (opcional)

O pacote tambem exporta componentes internos de Specification Pattern para casos avancados.

Exemplo de parse + avaliacao de path:

```ts
import {
  DslToSpecificationParser,
  RuntimeEvaluationVisitor
} from "@obcrm/segmentation";

let parser = new DslToSpecificationParser();
let visitor = new RuntimeEvaluationVisitor();
let specification = parser.parseConditionNode( { equals: [ "contact.activeFlag", true ] } );

let matchedPath = visitor.findMatchedPath( specification, context, "if" );
```

## Limites e comportamento atual

- O contrato recomendado continua sendo DSL JSON.
- SegmentEvaluator opera para segmentos dinamicos; segmentos estaticos dependem do fluxo de membership da aplicacao consumidora.
- Nem toda regra e 100% SQL-compilavel. Sempre verificar capability.
- Para criterios behavior, existe caminho hibrido entre implementacao dedicada e adapter legado.

## Playbook para time e AIs

1. Monte ou receba a definicao DSL.
2. Valide com SegmentValidator.
3. Se for runtime por contato, use SegmentEvaluator.
4. Se for preview/count SQL, use SegmentQueryCompiler e cheque capability.
5. Se sqlCompilable for false, trate fallback com base em nonSqlReasonArray.
6. Preserve sempre o contrato DSL como entrada principal entre sistemas.

## Publicacao

1. Ajustar versao em package.json.
2. Gerar build: npm run build.
3. Publicar no registry configurado:
   - npm publish --access public
   - ou publish em registry privado da empresa

## Observacoes

- Este pacote contem apenas o nucleo da segmentacao.
- Integracoes com banco/repositorio, roteamento HTTP e use-cases do CRM permanecem nas aplicacoes consumidoras.


## Exemplo de uso
```ts
public static async testCrmPackage()
  {
    // Regra: contatos com professionalOccupation = "Trabalho na área de Mecânica"
    const definition = SegmentDslBuilder
      .create()
      .when( SegmentDslBuilder.equals( "contact.activeFlag", true ) )
      .and( SegmentDslBuilder.gte( "orchestration.priority", 5 ) )
      .thenInclude( "segment_rule_matched" )
      .defaultExclude( "default_exclude" )
      .build();

    // 1) Preview remoto — busca contatos via CRM API
    console.log("=== Preview Remoto (CRM API) ===");
    try {
      const previewResult = await definition.preview({
        tenantId: 35,
        limit: 2,
        includeEstimatedCount: true,
        accessToken: process.env.CRM_API_TOKEN!,
      });
      console.log("Preview remoto concluído com sucesso.", previewResult);

      console.log("Contatos encontrados:", previewResult.sampleArray.length);
      console.log("Tem mais?:", previewResult.hasMore);
      console.log("Contagem estimada:", previewResult.estimatedCount);
      console.log("Tempo de execução:", previewResult.executionMs, "ms");
      console.log("Amostra:", previewResult.sampleArray.slice(0, 5));
    } catch (error) {
      console.error("Erro no preview remoto:", error);
      console.error("Erro no preview remoto:", (error as Error).message);
    }

    // 2) Filter options — campos disponíveis para segmentação
    console.log("\n=== Filter Options ===");
    try {
      const filterOptions = await definition.listFilterOptions({
        tenantId: 35,
        attributeLimit: 100,
        tagLimit: 200,
        accessToken: process.env.CRM_API_TOKEN!,
      });

      console.log("Operadores disponíveis:", filterOptions.operatorCatalogArray);
      console.log("Campos disponíveis:", filterOptions.fieldOptionArray.length);
      filterOptions.fieldOptionArray.slice(0, 10).forEach(f =>
        console.log(`  - ${f.path} (${f.valueType}, source: ${f.source})`)
      );
      console.log("@@@@@@@@", filterOptions);
    } catch (error) {
      console.error("Erro no listFilterOptions:", (error as Error).message);
    }
  }
```