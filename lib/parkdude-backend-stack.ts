import cdk = require("@aws-cdk/core");
import apigateway = require("@aws-cdk/aws-apigateway");
import lambda = require("@aws-cdk/aws-lambda");
import { LambdaIntegration } from "@aws-cdk/aws-apigateway";

export class ParkdudeBackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const restApiHandler = new lambda.Function(this, "RestApiHandler", {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.asset("./build"),
      handler: "handlers/rest-api.handler",
      environment: {}
    });

    const restApi = new apigateway.RestApi(this, "rest-api", {
      restApiName: "REST API",
      description: "This service serves widgets."
    });

    const restApiRoot = restApi.root.addResource("api");
    restApiRoot.addProxy({
      defaultIntegration: new LambdaIntegration(restApiHandler),
      anyMethod: true
    });

    // TODO: More configurations (e.g. for production)
  }
}