# Lakify on Kubernetes

Everything the application needs is described here as code and applied with
Kustomize (`kubectl apply -k`).

```
k8s/
  base/                  all components, shared by every environment
    namespace.yaml       namespace "lakify" with the restricted Pod Security Standard
    db/                  PostgreSQL StatefulSet (1 replica, 1 Gi volume), headless Service, schema.sql
    api/                 API Deployment (2 replicas), Service, ConfigMap with database settings
    web/                 nginx front end Deployment (2 replicas), Service (the entry point)
    monitoring/          Prometheus (scrapes the API pods), Grafana (dashboard provisioned)
  overlays/
    kind/                used by the pipeline's throwaway Kind cluster
    local/               long-running demo cluster (Minikube or Docker Desktop)
```

| Component | Kind | Replicas | Service | Probes |
|---|---|---|---|---|
| lakify-web (nginx) | Deployment | 2 | `lakify-web:80` | `/healthz` |
| lakify-api (Node.js) | Deployment | 2 | `lakify-api:80` | startup + liveness `/health`, readiness `/ready` (checks the database) |
| lakify-db (PostgreSQL 17) | StatefulSet + PVC | 1 | `lakify-db:5432` (headless) | `pg_isready` |
| prometheus | Deployment | 1 | `prometheus:9090` | `/-/ready`, `/-/healthy` |
| grafana | Deployment | 1 | `grafana:3000` | `/api/health` |

Every pod runs as a non-root user with no Linux capabilities, privilege
escalation disabled and the default seccomp profile; the namespace refuses
pods that do not.

## Secrets

The database password is never stored in the repository. Create it before
deploying (the pipeline does this from the `DB_PASSWORD` GitHub Actions
secret, or a random value if that secret is not set):

```bash
kubectl create namespace lakify --dry-run=client -o yaml | kubectl apply -f -
kubectl -n lakify create secret generic lakify-db --from-literal=password='choose-a-password'
# optional: Grafana admin password (otherwise Grafana's default is used)
kubectl -n lakify create secret generic lakify-grafana --from-literal=admin-password='choose-another'
```

## Run the demo cluster locally

With **Minikube** (`minikube start`) or **Docker Desktop** (Settings → Kubernetes → Enable):

```bash
# 1. secrets (see above), then:
kubectl apply -k k8s/overlays/local
kubectl -n lakify rollout status statefulset/lakify-db
kubectl -n lakify rollout status deployment/lakify-api
kubectl -n lakify rollout status deployment/lakify-web

# 2. open the app and the dashboard
kubectl -n lakify port-forward svc/lakify-web 8080:80     # http://localhost:8080
kubectl -n lakify port-forward svc/grafana 3001:3000      # http://localhost:3001
kubectl -n lakify port-forward svc/prometheus 9090:9090   # http://localhost:9090
```

The images are pulled from GitHub Container Registry, so the `lakify-api`
and `lakify-web` packages must be public (GitHub → your profile → Packages →
package settings → Change visibility).

To generate some traffic for the dashboard:

```bash
for i in $(seq 1 200); do curl -s localhost:8080/api/listings > /dev/null; done
```

## Remove everything

```bash
kubectl delete -k k8s/overlays/local
kubectl -n lakify delete pvc --all   # also deletes the database volume
```
