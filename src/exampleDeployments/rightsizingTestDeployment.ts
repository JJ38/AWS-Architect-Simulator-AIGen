import APIGatewayV2 from "../Models/Services/APIGatewayV2";
import DynamoDB from "../Models/Services/DynamoDB";
import EC2 from "../Models/Services/EC2";
import Lambda from "../Models/Services/Lambda";
import S3 from "../Models/Services/S3";
import SQS from "../Models/Services/SQS";
import type { ResourceStatics } from "../Models/Resource";
import { services } from "../constants";
import type { AppEdge, AppNode, EdgeType, ResourceData } from "../types";

/*
 * A small "online shop" architecture built specifically to exercise
 * capacity/rightsizing detection - see todo.md's capacity-sim section for
 * the full writeup of why each piece is here. Built with the real
 * Resource.create() factories (not hand-rolled JSON) so it can never drift
 * out of sync with the actual node/edge data shape.
 *
 *                              shop-api (API Gateway V2)
 *                             /                         \
 *                  checkout-fn (Lambda)         catalog-web (EC2, t3.micro,
 *                   /          \                 no ASG - BOTTLENECK #1)
 *       order-queue (SQS)   order-receipts (S3)   /              \
 *              |                        catalog-table         product-images
 *     fulfillment-fn (Lambda,        (DynamoDB, 5 RCU/2 WCU   (S3)
 *      reserved concurrency 20        - BOTTLENECK #2)
 *      - BOTTLENECK #3)
 *
 * Three deliberately under-provisioned nodes, three different *kinds* of
 * capacity limit: catalog-web (an illustrative instance-throughput estimate),
 * catalog-table (a real but separate AWS limit, RCU/WCU), fulfillment-fn (a
 * real, precisely-modelled AWS limit - exceeding reserved concurrency is a
 * genuine 429 TooManyRequestsException, not an estimate). All three are
 * sized for a quiet month's baseline traffic, not a spike - fine most of the
 * period, over capacity only once the peak hits.
 *
 * checkout-fn (no reservation, draws from the shared account pool) and
 * shop-api/order-queue/both S3 buckets are the control group: should show
 * not_applicable / no capacity warning at any traffic level, proving the
 * detector flags the right things and not everything.
 */

interface NodePosition{ x: number, y: number }

function makeNode(id: string, resourceClass: ResourceStatics, serviceKey: string, position: NodePosition, configure: (data: ResourceData) => void): AppNode{

    const service = services[serviceKey];
    const data = resourceClass.create(id, service);

    configure(data);

    return {
        id,
        position,
        data,
        type: "imageNode",
        measured: { width: 1, height: 1 },
    } as AppNode;

}

function computeValidEdgeTypes(callerClass: ResourceStatics, receiverClass: ResourceStatics): EdgeType[]{
    return callerClass.sourceTypes.filter((edgeType) => receiverClass.targetTypes.includes(edgeType));
}

function makeEdge(
    id: string,
    visualSourceId: string,
    visualTargetId: string,
    callerID: string,
    receiverID: string,
    callerName: string,
    receiverName: string,
    edgeType: EdgeType,
    validEdgeTypes: EdgeType[]
): AppEdge{

    return {
        id,
        source: visualSourceId,
        target: visualTargetId,
        type: "standardEdge",
        data: {
            metaData: { callerName, receiverName },
            componentProperties: {
                behaviour: {
                    edgeType: { value: edgeType, type: "edgeType", options: validEdgeTypes }
                }
            },
            terraformProperties: {},
            resources: { callerID, receiverID },
            // Unused in practice (every real read goes through
            // componentProperties.behaviour.edgeType.value above) but part
            // of EdgeData's declared shape.
            edgeType
        }
    } as AppEdge;

}

export function createRightsizingTestDeployment(): { nodes: AppNode[], edges: AppEdge[] }{

    const apiId = "n-example-shop-api";
    const checkoutId = "n-example-checkout-fn";
    const fulfillmentId = "n-example-fulfillment-fn";
    const catalogWebId = "n-example-catalog-web";
    const catalogTableId = "n-example-catalog-table";
    const queueId = "n-example-order-queue";
    const receiptsId = "n-example-order-receipts";
    const imagesId = "n-example-product-images";

    const nodes: AppNode[] = [

        makeNode(apiId, APIGatewayV2, "API Gateway V2", { x: 500, y: 40 }, (data) => {
            data.terraformProperties.aws_apigatewayv2_api.name.value = "shop-api";
            data.terraformProperties.aws_apigatewayv2_api.protocol_type.value = "HTTP";
        }),

        makeNode(checkoutId, Lambda, "Lambda", { x: 250, y: 260 }, (data) => {
            data.terraformProperties.aws_lambda_function.function_name.value = "checkout-fn";
            data.terraformProperties.aws_lambda_function.memory_size.value = 256;
            data.terraformProperties.aws_lambda_function.timeout.value = 10;
            data.componentProperties.simulation.estimated_avg_duration_ms.value = 150;
        }),

        // BOTTLENECK #1: a single small instance taking production traffic
        // directly, with no auto scaling group behind it. The app doesn't
        // model ASGs as a separate service yet, so "no ASG" is represented
        // simply by this being one bare EC2 node wired straight to the
        // entry point - exactly the real-world shape of the mistake.
        makeNode(catalogWebId, EC2, "EC2", { x: 750, y: 260 }, (data) => {
            data.terraformProperties.aws_instance.instance_type.value = "t3.micro";
            data.terraformProperties.aws_instance.tags.value.Name.value = "catalog-web";
        }),

        makeNode(queueId, SQS, "SQS", { x: 100, y: 470 }, (data) => {
            data.terraformProperties.aws_sqs_queue.name.value = "order-queue";
        }),

        makeNode(receiptsId, S3, "S3", { x: 400, y: 470 }, (data) => {
            data.terraformProperties.aws_s3_bucket.bucket.value = "order-receipts";
            data.componentProperties.simulation.estimated_storage_gb.value = 5;
            // Receipts are written far more than they're read back.
            data.componentProperties.simulation.read_traffic_percent.value = 20;
        }),

        // BOTTLENECK #2: provisioned capacity sized for a quiet month, not
        // a traffic spike - compounds with catalog-web above (undersized
        // compute calling an undersized data store is a very common real
        // pairing, not a contrived one).
        makeNode(catalogTableId, DynamoDB, "DynamoDB", { x: 650, y: 470 }, (data) => {
            data.terraformProperties.aws_dynamodb_table.name.value = "catalog-table";
            data.terraformProperties.aws_dynamodb_table.hash_key.value = "sku";
            data.terraformProperties.aws_dynamodb_table.billing_mode.value = "PROVISIONED";
            data.terraformProperties.aws_dynamodb_table.read_capacity.value = 5;
            data.terraformProperties.aws_dynamodb_table.write_capacity.value = 2;
        }),

        makeNode(imagesId, S3, "S3", { x: 900, y: 470 }, (data) => {
            data.terraformProperties.aws_s3_bucket.bucket.value = "product-images";
            data.componentProperties.simulation.estimated_storage_gb.value = 40;
        }),

        // BOTTLENECK #3: a reserved concurrency limit set for cost control
        // (a very real, common practice) but sized for the quiet-month
        // baseline, not the spike - 20 concurrent executions covers ~8 req/s
        // at this function's 400ms average duration comfortably, but falls
        // well short of the ~120 needed at a 300 req/s peak.
        makeNode(fulfillmentId, Lambda, "Lambda", { x: 100, y: 680 }, (data) => {
            data.terraformProperties.aws_lambda_function.function_name.value = "fulfillment-fn";
            data.terraformProperties.aws_lambda_function.memory_size.value = 512;
            data.terraformProperties.aws_lambda_function.timeout.value = 30;
            data.terraformProperties.aws_lambda_function.reserved_concurrent_executions.value = 20;
            data.componentProperties.simulation.estimated_avg_duration_ms.value = 400;
        }),

    ];

    const edges: AppEdge[] = [

        makeEdge("n-example-edge-api-checkout", apiId, checkoutId, apiId, checkoutId, "API Gateway V2", "Lambda", "sync", computeValidEdgeTypes(APIGatewayV2, Lambda)),
        makeEdge("n-example-edge-api-catalog", apiId, catalogWebId, apiId, catalogWebId, "API Gateway V2", "EC2", "sync", computeValidEdgeTypes(APIGatewayV2, EC2)),
        makeEdge("n-example-edge-catalog-table", catalogWebId, catalogTableId, catalogWebId, catalogTableId, "EC2", "DynamoDB", "sync", computeValidEdgeTypes(EC2, DynamoDB)),
        makeEdge("n-example-edge-catalog-images", catalogWebId, imagesId, catalogWebId, imagesId, "EC2", "S3", "sync", computeValidEdgeTypes(EC2, S3)),
        makeEdge("n-example-edge-checkout-queue", checkoutId, queueId, checkoutId, queueId, "Lambda", "SQS", "async", computeValidEdgeTypes(Lambda, SQS)),
        // Pull edge: the visual arrow is drawn queue -> fulfillment (the
        // queue feeds the function), but the caller is whichever side
        // actively pulls - fulfillment-fn polling the queue - matching
        // CanvasController.onConnect's swap for "pull" edges.
        makeEdge("n-example-edge-queue-fulfillment", queueId, fulfillmentId, fulfillmentId, queueId, "Lambda", "SQS", "pull", computeValidEdgeTypes(SQS, Lambda)),
        makeEdge("n-example-edge-checkout-receipts", checkoutId, receiptsId, checkoutId, receiptsId, "Lambda", "S3", "sync", computeValidEdgeTypes(Lambda, S3)),

    ];

    return { nodes, edges };

}
