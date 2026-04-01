/**
 * parseIaC.js
 *
 * Transforms a Terraform HCL string (or a pre-parsed Pluralith graph JSON) into
 * a normalised graph structure that drives the architecture diagram renderer.
 *
 * Output shape — intentionally compatible with Pluralith graph JSON so that a
 * real backend running `pluralith graph --out graph.json` can be dropped in
 * without touching the renderer:
 *
 *   {
 *     nodes:  Node[],   // visible service nodes
 *     edges:  Edge[],   // directional connections between visible nodes
 *     groups: Group[],  // subnet / zone groupings
 *     meta:   { resourceCount, visibleCount, region }
 *   }
 *
 * Node  : { id, resourceType, resourceName, category, label, spec, abbr }
 * Edge  : { from, to, label }
 * Group : { id, label, colorKey, contains: string[] }
 */

// ── Resource type → visual category ──────────────────────────────────────────

export const CATEGORY_MAP = {
  // ── Compute ──────────────────────────────────────────────────
  aws_instance:                     'ec2',
  aws_launch_template:              'ec2',
  aws_autoscaling_group:            'ec2',
  aws_spot_instance_request:        'ec2',
  aws_eks_cluster:                  'ec2',
  aws_eks_node_group:               'ec2',
  aws_ecs_cluster:                  'ec2',
  aws_ecs_service:                  'ec2',
  aws_ecs_task_definition:          'ec2',
  aws_lambda_function:              'ec2',
  aws_batch_compute_environment:    'ec2',
  aws_lightsail_instance:           'ec2',

  // ── Load balancers / entry points ────────────────────────────
  aws_lb:                           'alb',
  aws_alb:                          'alb',
  aws_lb_listener:                  'alb',
  aws_alb_listener:                 'alb',
  aws_lb_target_group:              'alb',
  aws_alb_target_group:             'alb',
  aws_cloudfront_distribution:      'alb',
  aws_api_gateway_rest_api:         'alb',
  aws_apigatewayv2_api:             'alb',
  aws_api_gateway_stage:            'alb',

  // ── Relational / NoSQL databases ─────────────────────────────
  aws_db_instance:                  'rds',
  aws_rds_cluster:                  'rds',
  aws_rds_cluster_instance:         'rds',
  aws_dynamodb_table:               'rds',
  aws_redshift_cluster:             'rds',
  aws_neptune_cluster:              'rds',
  aws_docdb_cluster:                'rds',
  aws_docdb_cluster_instance:       'rds',
  aws_timestream_database:          'rds',

  // ── Cache / messaging ────────────────────────────────────────
  aws_elasticache_cluster:              'cache',
  aws_elasticache_replication_group:    'cache',
  aws_elasticache_parameter_group:      'cache',
  aws_sqs_queue:                        'cache',
  aws_sns_topic:                        'cache',
  aws_mq_broker:                        'cache',
  aws_kinesis_stream:                   'cache',

  // ── Object / file storage ────────────────────────────────────
  aws_s3_bucket:                    's3',
  aws_efs_file_system:              's3',
  aws_fsx_lustre_file_system:       's3',
  aws_fsx_windows_file_system:      's3',
  aws_ebs_volume:                   's3',
  aws_glacier_vault:                's3',
  aws_backup_vault:                 's3',

  // ── Secrets / IAM / security ─────────────────────────────────
  aws_secretsmanager_secret:        'secrets',
  aws_ssm_parameter:                'secrets',
  aws_kms_key:                      'secrets',
  aws_iam_role:                     'secrets',
  aws_iam_policy:                   'secrets',
  aws_acm_certificate:              'secrets',
  aws_wafv2_web_acl:                'secrets',
  aws_cognito_user_pool:            'secrets',
  aws_shield_protection:            'secrets',

  // ── Networking infrastructure (grouped but NOT primary nodes) ─
  aws_vpc:                          'vpc',
  aws_subnet:                       'subnet',
  aws_security_group:               'sg',
  aws_security_group_rule:          'sg',
  aws_internet_gateway:             'gateway',
  aws_nat_gateway:                  'gateway',
  aws_route_table:                  'infra',
  aws_route_table_association:      'infra',
  aws_route53_zone:                 'infra',
  aws_route53_record:               'infra',
  aws_cloudwatch_metric_alarm:      'infra',
  aws_cloudwatch_log_group:         'infra',
  aws_vpc_endpoint:                 'infra',
  aws_eip:                          'infra',
}

// Categories that become visible diagram nodes
const VISIBLE = new Set(['alb', 'ec2', 'rds', 'cache', 's3', 'secrets'])

// Human-friendly label per resource type
const LABELS = {
  aws_instance:                     'EC2 Instance',
  aws_launch_template:              'Launch Template',
  aws_autoscaling_group:            'Auto Scaling Group',
  aws_eks_cluster:                  'EKS Cluster',
  aws_eks_node_group:               'EKS Node Group',
  aws_ecs_cluster:                  'ECS Cluster',
  aws_ecs_service:                  'ECS Service',
  aws_ecs_task_definition:          'Task Definition',
  aws_lambda_function:              'Lambda',
  aws_lb:                           'Load Balancer',
  aws_alb:                          'Load Balancer',
  aws_lb_listener:                  'LB Listener',
  aws_alb_listener:                 'LB Listener',
  aws_lb_target_group:              'Target Group',
  aws_alb_target_group:             'Target Group',
  aws_cloudfront_distribution:      'CloudFront',
  aws_api_gateway_rest_api:         'API Gateway',
  aws_apigatewayv2_api:             'API Gateway v2',
  aws_db_instance:                  'RDS',
  aws_rds_cluster:                  'Aurora Cluster',
  aws_rds_cluster_instance:         'Aurora Instance',
  aws_dynamodb_table:               'DynamoDB',
  aws_redshift_cluster:             'Redshift',
  aws_neptune_cluster:              'Neptune',
  aws_elasticache_cluster:          'ElastiCache',
  aws_elasticache_replication_group:'ElastiCache',
  aws_sqs_queue:                    'SQS Queue',
  aws_sns_topic:                    'SNS Topic',
  aws_kinesis_stream:               'Kinesis',
  aws_s3_bucket:                    'S3 Bucket',
  aws_efs_file_system:              'EFS',
  aws_ebs_volume:                   'EBS Volume',
  aws_secretsmanager_secret:        'Secrets Manager',
  aws_ssm_parameter:                'SSM Parameter',
  aws_kms_key:                      'KMS Key',
  aws_iam_role:                     'IAM Role',
  aws_wafv2_web_acl:                'WAF',
  aws_cognito_user_pool:            'Cognito',
}

// Short abbreviation shown in the icon box
const ABBRS = {
  alb:     'ALB',
  ec2:     'EC2',
  rds:     'RDS',
  cache:   'CACHE',
  s3:      'S3',
  secrets: 'SEC',
}

// ── HCL brace-depth parser ────────────────────────────────────────────────────

/**
 * Walk the HCL text and extract every resource block, preserving nested braces.
 */
function extractBlocks(hcl) {
  const blocks = []
  const re = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g
  let m

  while ((m = re.exec(hcl)) !== null) {
    const resourceType = m[1]
    const resourceName = m[2]
    const start = m.index + m[0].length
    let depth = 1
    let i = start

    while (i < hcl.length && depth > 0) {
      const ch = hcl[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      i++
    }

    blocks.push({ resourceType, resourceName, body: hcl.slice(start, i - 1) })
  }

  return blocks
}

/**
 * Read a simple scalar attribute from a resource body.
 * Handles both quoted strings and unquoted booleans/numbers.
 */
function readAttr(body, key) {
  const re = new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|(\\S+[^\\s,}]))`)
  const m = re.exec(body)
  if (!m) return null
  return m[1] !== undefined ? m[1] : m[2] ?? null
}

/**
 * Build the spec subtitle string shown under the service name.
 */
function buildSpec(type, body) {
  switch (type) {
    case 'aws_instance':
    case 'aws_launch_template':
      return readAttr(body, 'instance_type') || ''

    case 'aws_autoscaling_group': {
      const desired = readAttr(body, 'desired_capacity')
      const min     = readAttr(body, 'min_size')
      const max     = readAttr(body, 'max_size')
      if (min || max) return `${desired || min}× · ASG ${min}–${max}`
      return desired ? `${desired}×` : ''
    }

    case 'aws_lambda_function': {
      const runtime = readAttr(body, 'runtime')
      const mem     = readAttr(body, 'memory_size')
      return [runtime, mem ? `${mem} MB` : null].filter(Boolean).join(' · ')
    }

    case 'aws_db_instance': {
      const cls    = readAttr(body, 'instance_class')
      const engine = readAttr(body, 'engine')
      const ver    = readAttr(body, 'engine_version')
      return [cls, ver ? `${engine} ${ver}` : engine].filter(Boolean).join(' · ')
    }

    case 'aws_rds_cluster':
    case 'aws_rds_cluster_instance': {
      const engine = readAttr(body, 'engine')
      const ver    = readAttr(body, 'engine_version')
      return [engine, ver].filter(Boolean).join(' ')
    }

    case 'aws_dynamodb_table':
      return readAttr(body, 'billing_mode') || 'PAY_PER_REQUEST'

    case 'aws_elasticache_cluster':
    case 'aws_elasticache_replication_group': {
      const nodeType = readAttr(body, 'node_type')
      const engine   = readAttr(body, 'engine')
      return [nodeType, engine].filter(Boolean).join(' · ')
    }

    case 'aws_sqs_queue':
      return readAttr(body, 'fifo_queue') === 'true' ? 'FIFO' : 'Standard'

    case 'aws_lb':
    case 'aws_alb': {
      const lbType = readAttr(body, 'load_balancer_type') || 'application'
      const internal = readAttr(body, 'internal')
      return `${lbType.toUpperCase()} · ${internal === 'true' ? 'internal' : 'internet-facing'}`
    }

    case 'aws_cloudfront_distribution':
      return 'CDN · HTTPS'

    case 'aws_api_gateway_rest_api':
    case 'aws_apigatewayv2_api':
      return 'REST · HTTPS'

    case 'aws_s3_bucket':
      return readAttr(body, 'bucket') || ''

    case 'aws_efs_file_system':
      return readAttr(body, 'throughput_mode') || 'bursting'

    case 'aws_secretsmanager_secret':
    case 'aws_ssm_parameter':
      return 'credentials · runtime'

    case 'aws_kms_key':
      return readAttr(body, 'description') || 'encryption'

    case 'aws_cognito_user_pool':
      return 'auth · JWT'

    default:
      return ''
  }
}

/**
 * Find all `resourceType.name` references inside a block body that correspond
 * to known resource IDs.  Returns deduped array of referenced IDs.
 */
function findRefs(body, knownIds) {
  const refs = new Set()
  const re = /\b(aws_[a-z_]+)\.([\w-]+)(?:\.[a-z_]+)*/g
  let m
  while ((m = re.exec(body)) !== null) {
    const id = `${m[1]}.${m[2]}`
    if (knownIds.has(id)) refs.add(id)
  }
  return [...refs]
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse raw Terraform HCL text into a Pluralith-compatible graph object.
 */
export function parseHCL(hcl) {
  const blocks  = extractBlocks(hcl)
  const allIds  = new Set(blocks.map(b => `${b.resourceType}.${b.resourceName}`))

  // ── nodes (only visible categories) ──────────────────────────
  const nodes = []
  for (const { resourceType, resourceName, body } of blocks) {
    const category = CATEGORY_MAP[resourceType]
    if (!category || !VISIBLE.has(category)) continue

    nodes.push({
      id:           `${resourceType}.${resourceName}`,
      resourceType,
      resourceName,
      category,
      label:  LABELS[resourceType]       || resourceName,
      spec:   buildSpec(resourceType, body),
      abbr:   ABBRS[category]            || category.slice(0, 3).toUpperCase(),
    })
  }

  const visibleIds = new Set(nodes.map(n => n.id))

  // ── edges (references between visible nodes) ──────────────────
  const rawEdges = []
  const seen = new Set()

  for (const { resourceType, resourceName, body } of blocks) {
    const fromId   = `${resourceType}.${resourceName}`
    if (!visibleIds.has(fromId)) continue

    for (const toId of findRefs(body, visibleIds)) {
      if (toId === fromId) continue
      const key = `${fromId}→${toId}`
      if (seen.has(key)) continue
      seen.add(key)
      rawEdges.push({ from: fromId, to: toId, label: '' })
    }
  }

  // Also check non-visible resources for references between visible ones
  // (e.g. aws_autoscaling_group references aws_lb_target_group via attachment)
  for (const { resourceType, resourceName, body } of blocks) {
    const fromId = `${resourceType}.${resourceName}`
    if (visibleIds.has(fromId)) continue          // already handled above

    const refs = findRefs(body, visibleIds)
    if (refs.length < 2) continue                 // need at least 2 visible refs to imply connection

    // Infer: the first visible ref connects to the second (topology hint)
    const [a, b] = refs
    const key = `${a}→${b}`
    if (!seen.has(key) && !seen.has(`${b}→${a}`)) {
      seen.add(key)
      rawEdges.push({ from: a, to: b, label: '' })
    }
  }

  // Remove duplicate reverse-direction edges
  const edges = []
  const canonical = new Set()
  for (const e of rawEdges) {
    if (!canonical.has(`${e.to}→${e.from}`)) {
      canonical.add(`${e.from}→${e.to}`)
      edges.push(e)
    }
  }

  // ── groups (subnet zones) ─────────────────────────────────────
  const groups = [
    {
      id:       'public',
      label:    'Public subnet',
      colorKey: 'alb',
      contains: nodes.filter(n => n.category === 'alb').map(n => n.id),
    },
    {
      id:       'compute',
      label:    'Private · compute',
      colorKey: 'ec2',
      contains: nodes.filter(n => n.category === 'ec2' || n.category === 'secrets').map(n => n.id),
    },
    {
      id:       'data',
      label:    'Private · data',
      colorKey: 'rds',
      contains: nodes.filter(n => ['rds', 'cache', 's3'].includes(n.category)).map(n => n.id),
    },
  ].filter(g => g.contains.length > 0)

  // ── region hint ───────────────────────────────────────────────
  const regionMatch = hcl.match(/region\s*=\s*"([^"]+)"/)
  const region = regionMatch ? regionMatch[1] : 'us-east-1'

  return {
    nodes,
    edges,
    groups,
    meta: {
      resourceCount: blocks.length,
      visibleCount:  nodes.length,
      region,
    },
  }
}

/**
 * Universal entry point.
 *
 * Accepts:
 *   - A Terraform HCL string                → parsed via parseHCL()
 *   - A pre-built Pluralith graph JSON object → passed through unchanged
 *
 * This makes it trivial to swap in a real Pluralith backend: just pass the
 * JSON it returns as `input` instead of the raw HCL string.
 */
export function parseIaC(input) {
  if (!input) return null

  // Pre-parsed Pluralith graph JSON (duck-typed: must have nodes + edges)
  if (typeof input === 'object' && Array.isArray(input.nodes) && Array.isArray(input.edges)) {
    return input
  }

  // Raw HCL text
  if (typeof input === 'string' && input.trim().length > 0) {
    try {
      return parseHCL(input)
    } catch {
      return null
    }
  }

  return null
}
