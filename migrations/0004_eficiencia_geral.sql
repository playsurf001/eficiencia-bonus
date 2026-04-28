-- Migration 0004: ajusta tabela bonificacao_geral para guardar
-- a EFICIÊNCIA GERAL DO MÊS (em %), não mais um valor manual em R$.
-- A planilha original tem um campo "Eficiência mês" (AG8) que é usado
-- para calcular Bonificação Geral $ = (efic_mes - 0,75) × 20 × 50.
--
-- Mantemos a coluna `valor` para compatibilidade (= cache do valor em R$),
-- mas a nova fonte de verdade é `eficiencia_pct`.

ALTER TABLE bonificacao_geral ADD COLUMN eficiencia_pct REAL DEFAULT NULL;

-- Backfill: caso já haja registros antigos com `valor`, a `eficiencia_pct`
-- pode ser derivada (valor = (e/100 - 0,75) * 20 * 50  →  e = 100*(valor/1000 + 0,75)).
-- Como há poucos registros (e tipicamente nenhum em produção real ainda),
-- vamos zerar e deixar o admin reinserir.
UPDATE bonificacao_geral SET eficiencia_pct = 0 WHERE eficiencia_pct IS NULL;
