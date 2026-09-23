# API contract

Frozen contract between the React frontend and the Go microservice. Both layers are built against
this document, so it is the single source of truth: any change here must be reflected in both
layers and in the tests.

Base path: `/api/v1`

---

## `POST /api/v1/calculate`

Performs one arithmetic operation. The server owns the semantics of the operation (what the result
is, and whether it is defined at all).

### Request

```json
{
  "operation": "divide",
  "operands": [12, 4]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `operation` | string | Required. One of the supported operations below. |
| `operands` | number[] | Required. Length must match the operation's arity. Finite numbers only. |

Operands are an **array**, not `a`/`b`, so arity becomes a property of the operation. Unary
operations (`sqrt`) fit the same contract without changing it.

### Supported operations

| `operation` | Arity | Meaning | Status |
| --- | --- | --- | --- |
| `add` | 2 | `a + b` | in scope |
| `subtract` | 2 | `a - b` | in scope |
| `multiply` | 2 | `a * b` | in scope |
| `divide` | 2 | `a / b`, `b != 0` | in scope |
| `power` | 2 | `a ^ b` | in scope |
| `sqrt` | 1 | `√a`, `a >= 0` | in scope |
| `percent` | 2 | `a% of b`, i.e. `a / 100 * b` | in scope |

### Success — `200 OK`

```json
{
  "operation": "divide",
  "operands": [12, 4],
  "result": 3
}
```

The request is echoed back so a response is self-describing in logs and in the client's history.

### Error — non-2xx

Every error, without exception, uses the same envelope:

```json
{
  "error": {
    "code": "DIVISION_BY_ZERO",
    "message": "Division by zero is undefined"
  }
}
```

`code` is a stable machine-readable identifier the frontend can branch on; `message` is
human-readable text safe to display to the user as-is.

| `code` | Status | When |
| --- | --- | --- |
| `INVALID_JSON` | 400 | Body is not valid JSON, is empty, is not a JSON object, has trailing content, carries an unknown field, or exceeds the size limit (4 KiB) |
| `VALIDATION_ERROR` | 400 | Missing field, non-numeric operand, non-finite operand, wrong number of operands |
| `UNSUPPORTED_OPERATION` | 400 | `operation` is not in the table above |
| `DIVISION_BY_ZERO` | 400 | `divide` with `b == 0` |
| `UNDEFINED_RESULT` | 400 | Operation is undefined for these operands — `sqrt` of a negative number |
| `OVERFLOW` | 400 | Result is not a finite number (`±Inf` or `NaN`) |
| `NOT_FOUND` | 404 | Unknown route |
| `METHOD_NOT_ALLOWED` | 405 | Known route, wrong HTTP method. The response carries an `Allow` header naming the methods the route accepts, as RFC 9110 requires. |
| `INTERNAL_ERROR` | 500 | Unexpected failure recovered by middleware — never a stack trace, never leaked internals |

Domain rejections such as division by zero are **client errors (400)**: the request was understood
and refused on its merits. A 500 means the service itself misbehaved and should be the only
unexpected status in the catalogue.

---

## `GET /api/v1/health`

Liveness probe, used by the Docker Compose healthcheck.

```json
{ "status": "ok" }
```

Always `200 OK` while the process is serving.

---

## Examples

```bash
# addition
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[2,3]}'
# {"operation":"add","operands":[2,3],"result":5}

# division by zero
curl -s -i localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","operands":[12,0]}'
# HTTP/1.1 400 Bad Request
# {"error":{"code":"DIVISION_BY_ZERO","message":"Division by zero is undefined"}}

# overflow
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"multiply","operands":[1e308,10]}'
# {"error":{"code":"OVERFLOW","message":"Overflow: the result could not be calculated"}}

# wrong arity
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[1]}'
# {"error":{"code":"VALIDATION_ERROR","message":"Operation \"add\" requires 2 operands, got 1"}}

# unsupported operation
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"tangent","operands":[1]}'
# {"error":{"code":"UNSUPPORTED_OPERATION","message":"Unsupported operation \"tangent\""}}

# exponentiation
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"power","operands":[2,10]}'
# {"operation":"power","operands":[2,10],"result":1024}

# a power whose result is not a finite number
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"power","operands":[0,-1]}'
# {"error":{"code":"OVERFLOW","message":"Overflow: the result could not be calculated"}}

# square root — the one unary operation
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","operands":[9]}'
# {"operation":"sqrt","operands":[9],"result":3}

# square root of a negative number
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"sqrt","operands":[-9]}'
# {"error":{"code":"UNDEFINED_RESULT","message":"Square root of a negative number is undefined"}}

# percentage — "15% of 200"
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"percent","operands":[15,200]}'
# {"operation":"percent","operands":[15,200],"result":30}
```
