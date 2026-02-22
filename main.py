import json
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/curbs")
def get_curbs():
    curbs = json.load(open("ADA_Curb_Ramp.geojson"))
    return curbs