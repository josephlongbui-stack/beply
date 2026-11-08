#!/usr/bin/env python3
"""Validate the fictional demo arithmetic using only Python's standard library.

This is a small exact-search reference for the SAME-DAY fixture. It is not the
production application or a general-purpose multi-period inventory optimizer.
Run from any directory: python3 checks/reference_check.py
"""
from __future__ import annotations

import itertools
import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def requirements(data: dict[str, Any]) -> dict[str, int]:
    recipes = {r['id']: r for r in data['recipes']}
    totals = {i['id']: 0 for i in data['ingredients']}
    for run in data['production_plan']['items']:
        recipe = recipes[run['recipe_id']]
        batches = math.ceil(run['planned_units'] / recipe['yield_units'])
        for row in recipe['ingredients']:
            totals[row['ingredient_id']] += batches * row['quantity_base']
    return totals


def solve(data: dict[str, Any], *, max_stores: int, flour_extra: int = 0,
          spendable_cents: int | None = None) -> dict[str, Any]:
    """Enumerate retailer subsets and all sufficient package mixes per ingredient.

    All same-day eligible offers in this fixture have no order minimum, no tax,
    no coupon, no quantity limit, and no tier-dependent price. The reference
    deliberately does not generalize these assumptions silently.
    """
    needs = requirements(data)
    stock = {r['ingredient_id']: r['quantity_base'] for r in data['opening_stock']}
    stock['flour'] += flour_extra
    capacities = {i['id']: i['max_storage_base'] for i in data['ingredients']}
    suppliers = {s['id']: s for s in data['suppliers'] if s['mode'] == 'in_store'}
    best: dict[str, Any] | None = None
    for n in range(1, min(max_stores, len(suppliers)) + 1):
        for supplier_ids in itertools.combinations(sorted(suppliers), n):
            allowed = [o for o in data['offers']
                       if o['supplier_id'] in supplier_ids and o['eligible_for_golden_case']]
            chosen: list[dict[str, Any]] = []
            possible = True
            for ingredient_id in needs:
                shortfall = max(0, needs[ingredient_id] - stock[ingredient_id])
                if shortfall == 0:
                    continue
                offers = [o for o in allowed if o['ingredient_id'] == ingredient_id]
                if not offers:
                    possible = False
                    break
                ranges = [range(math.ceil(shortfall / o['pack_quantity_base']) + 1)
                          for o in offers]
                ingredient_best = None
                for counts in itertools.product(*ranges):
                    amount = sum(q * o['pack_quantity_base'] for q, o in zip(counts, offers))
                    if amount < shortfall or stock[ingredient_id] + amount > capacities[ingredient_id]:
                        continue
                    price = sum(q * o['pack_price_cents'] for q, o in zip(counts, offers))
                    candidate = (price, amount - shortfall, counts)
                    if ingredient_best is None or candidate < ingredient_best:
                        ingredient_best = candidate
                if ingredient_best is None:
                    possible = False
                    break
                for q, offer in zip(ingredient_best[2], offers):
                    if q:
                        chosen.append({'ingredient_id': ingredient_id,
                                       'offer_id': offer['id'],
                                       'supplier_id': offer['supplier_id'],
                                       'packs': q,
                                       'quantity_base': q * offer['pack_quantity_base'],
                                       'line_cost_cents': q * offer['pack_price_cents']})
            if not possible:
                continue
            used = sorted({row['supplier_id'] for row in chosen})
            goods = sum(row['line_cost_cents'] for row in chosen)
            travel = sum(suppliers[s]['estimated_trip_cash_cost_cents'] for s in used)
            total = goods + travel
            candidate = {'total_cost_cents': total, 'goods_cost_cents': goods,
                         'estimated_trip_cost_cents': travel,
                         'supplier_ids': used, 'lines': chosen}
            if best is None or (total, len(used)) < (best['total_cost_cents'], len(best['supplier_ids'])):
                best = candidate
    if best is None:
        return {'status': 'no_supply_feasible_plan'}
    if spendable_cents is not None and best['total_cost_cents'] > spendable_cents:
        return {'status': 'budget_infeasible',
                'minimum_required_cents': best['total_cost_cents'],
                'shortfall_cents': best['total_cost_cents'] - spendable_cents,
                'reference_plan': best}
    best['status'] = 'feasible'
    return best


def validate(data: dict[str, Any]) -> dict[str, Any]:
    needs = requirements(data)
    assert needs == {'flour': 38000, 'butter': 2000, 'sugar': 3000,
                     'eggs': 20, 'yeast': 720, 'milk': 3000}, needs
    two = solve(data, max_stores=2, spendable_cents=10000)
    one = solve(data, max_stores=1, spendable_cents=10000)
    tight = solve(data, max_stores=2, spendable_cents=7500)
    after_receipt = solve(data, max_stores=2, flour_extra=5000, spendable_cents=9200)
    assert two['total_cost_cents'] == 7780, two
    assert two['goods_cost_cents'] == 6730, two
    assert one['total_cost_cents'] == 9330, one
    assert one['supplier_ids'] == ['market_a'], one
    assert tight['status'] == 'budget_infeasible' and tight['shortfall_cents'] == 280, tight
    assert after_receipt['total_cost_cents'] == 6980, after_receipt
    assert after_receipt['total_cost_cents'] + 800 == two['total_cost_cents']
    bought = {i: 0 for i in needs}
    opening = {r['ingredient_id']: r['quantity_base'] for r in data['opening_stock']}
    for row in two['lines']:
        bought[row['ingredient_id']] += row['quantity_base']
    ending = {i: opening[i] + bought[i] - needs[i] for i in needs}
    assert ending == {'flour': 4000, 'butter': 0, 'sugar': 0,
                      'eggs': 4, 'yeast': 380, 'milk': 0}, ending
    return {'fixture_notice': 'Fictional demo data; not live prices, tested forecasts, or production recipes.',
            'required_quantities_base': needs,
            'shortfalls_base': {i: max(0, needs[i] - opening[i]) for i in needs},
            'two_store_plan': two, 'one_store_plan': one,
            'estimated_savings_vs_one_store_cents': one['total_cost_cents'] - two['total_cost_cents'],
            'tight_budget_case': tight,
            'after_confirmed_flour_receipt_plan': after_receipt,
            'after_receipt_actual_spend_cents': 800,
            'after_receipt_actual_plus_remaining_plan_cents': 7780,
            'ending_raw_inventory_after_receiving_and_producing_base': ending,
            'validation_status': 'All reference assertions passed.'}


if __name__ == '__main__':
    path = ROOT / 'demo' / 'seed.json'
    if not path.is_file():
        raise SystemExit(f'Missing fixture: {path}')
    data = json.loads(path.read_text(encoding='utf-8'))
    result = validate(data)
    expected_path = ROOT / 'demo' / 'expected_results.json'
    if expected_path.exists():
        expected = json.loads(expected_path.read_text(encoding='utf-8'))
        if result != expected:
            raise SystemExit('Computed result differs from expected_results.json. Inspect the fixture; do not silently rewrite expected results.')
    print(json.dumps(result, ensure_ascii=False, indent=2))
