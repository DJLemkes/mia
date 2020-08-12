import boto3

client = boto3.client("s3")
# paginator = client.get_paginator("list_objects")
# operation_parameters = {'Bucket': 'yolt-dp-dta-data', "PaginationConfig": {}}
# page_iterator = paginator.paginate(**operation_parameters)

# for page in page_iterator:
#     print(page["Contents"])

def all_items(boto_client, paginator_name: str, response_dict_key: str, pagination_params: dict):
    paginator = client.get_paginator(paginator_name)
    operation_parameters = {**pagination_params, "PaginationConfig": {}}
    page_iterator = paginator.paginate(**operation_parameters)
    for page in page_iterator:
        for item in page[response_dict_key]:
            yield item

pagination_params = {'Bucket': 'yolt-dp-dta-data', "PaginationConfig": {}}
for s3_object in all_items(client, "list_objects", "Contents", pagination_params):
    print(s3_object)
