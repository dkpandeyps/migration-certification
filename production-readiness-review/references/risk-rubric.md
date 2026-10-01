# Risk Rubric — Residual Risk Classification and Reporting

Even after a PASS verdict, residual risks must be documented. This file defines how to identify, classify, and report them.

---

## Residual Risk Types

### 1. coverage_gap_risk
**Source:** Acknowledged unreachable items in any coverage dimension
**Definition:** Items that were waived from coverage create a risk that defects in those areas go undetected

**How to generate:**
For each item in `acknowledged-unreachable.json`:
```json
{
  "risk_id": "RR_001",
  "type": "coverage_gap_risk",
  "description": "Server error page not tested — error handling code may have defects",
  "source_acknowledgement": "page_009",
  "likelihood": "low",
  "impact": "medium",
  "mitigation": "Review error handling code manually or trigger error conditions in staging"
}
```

### 2. data_environment_risk
**Source:** Always present (automatic)
**Definition:** Functional certification uses test data; production data may trigger new code paths

```json
{
  "risk_id": "RR_002",
  "type": "data_environment_risk",
  "description": "Tests ran against synthetic test data. Production data may include edge cases (legacy formats, partial records, migrated data) not covered by test cases.",
  "likelihood": "medium",
  "impact": "medium",
  "mitigation": "Run smoke tests against a production data snapshot before go-live"
}
```

### 3. performance_risk
**Source:** Always present when no load/performance testing was done
**Definition:** Functional certification does not test behavior under load

```json
{
  "risk_id": "RR_003",
  "type": "performance_risk",
  "description": "No load or stress testing was performed. Certification only validates functional correctness at single-user throughput.",
  "likelihood": "medium",
  "impact": "high",
  "mitigation": "Run load tests (k6, JMeter, Locust) before go-live if the application serves concurrent users"
}
```

### 4. integration_risk
**Source:** Present when the app uses third-party services
**Definition:** Third-party integrations (payment gateways, email services, OAuth providers) may behave differently in production

```json
{
  "risk_id": "RR_004",
  "type": "integration_risk",
  "description": "Payment gateway was tested in sandbox mode. Production credentials and live transaction processing not validated.",
  "likelihood": "low",
  "impact": "high",
  "mitigation": "Perform a controlled live transaction test before go-live"
}
```

### 5. defect_residual_risk
**Source:** Present when High or Medium defects exist but are accepted for go-live
**Definition:** Known defects that were not fixed may affect users

```json
{
  "risk_id": "RR_005",
  "type": "defect_residual_risk",
  "description": "3 High-severity defects were not fixed before go-live. DEF_003: Export CSV empty, DEF_004: Wrong error message on duplicate email, DEF_005: Filter not resetting",
  "likelihood": "high",
  "impact": "medium",
  "mitigation": "Fix DEF_003 (export) in first patch. DEF_004 and DEF_005 are low-impact and can be addressed in next sprint."
}
```

---

## Likelihood × Impact Matrix

| | Low Impact | Medium Impact | High Impact |
|--|-----------|--------------|------------|
| **Low Likelihood** | Negligible | Low | Medium |
| **Medium Likelihood** | Low | Medium | High |
| **High Likelihood** | Medium | High | Critical |

Use this matrix to assign an overall risk level to each residual risk.

---

## Automatic Risk Generation Rules

```
IF acknowledged_unreachable count > 0:
  → Add coverage_gap_risk for each acknowledged item

ALWAYS add:
  → data_environment_risk (always present)
  → performance_risk (always present)

IF any API endpoint classified as "payment", "billing", "subscription" in api-inventory:
  → Add integration_risk for payment processing

IF high_defects > 0 OR medium_defects > 5:
  → Add defect_residual_risk listing the defects
```

---

## Risk Output in Reports

In the production readiness report, list residual risks in a table:

| Risk ID | Type | Description | Likelihood | Impact | Overall | Mitigation |
|---------|------|-------------|-----------|--------|---------|-----------|
| RR_001 | Coverage Gap | Error page not tested | Low | Medium | Low | Manual code review |
| RR_002 | Data Environment | Synthetic test data only | Medium | Medium | Medium | Production data smoke test |
| RR_003 | Performance | No load testing | Medium | High | High | Run load tests |
