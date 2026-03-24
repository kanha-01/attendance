from sqlalchemy_schemadisplay import create_schema_graph
from app.database import Base,engine
from app import models   # VERY IMPORTANT (loads tables)

# Create graph from models
graph = create_schema_graph(
    engine=engine, 
    metadata=Base.metadata,
    show_datatypes=True,
    show_indexes=False,
)

# Save image
graph.write_png("schema.png")

print("Schema saved as schema.png")