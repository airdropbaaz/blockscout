defmodule Explorer.SmartContract.Solidity.CodeCompiler do
  @moduledoc """
  Module responsible to compile the Solidity code of a given Smart Contract.
  """

  require Logger

  @new_contract_name "New.sol"

  @required_standard_input_fields ~w(language sources settings)

  @default_output_selection %{"*" => %{"*" => ["*"]}}

  @doc """
  Compiles a code in the solidity command line.

  Returns a `Map`.

  ## Examples

      iex(1)> Explorer.SmartContract.Solidity.CodeCompiler.run([
      ...>      name: "SimpleStorage",
      ...>      compiler_version: "v0.4.24+commit.e67f0147",
      ...>      code: \"""
      ...>      pragma solidity ^0.4.24;
      ...>
      ...>      contract SimpleStorage {
      ...>          uint storedData;
      ...>
      ...>          function set(uint x) public {
      ...>              storedData = x;
      ...>          }
      ...>
      ...>          function get() public constant returns (uint) {
      ...>              return storedData;
      ...>          }
      ...>      }
      ...>      \""",
      ...>      optimize: false, evm_version: "byzantium"
      ...>  ])
      {
        :ok,
        %{
          "abi" => [
            %{
              "constant" => false,
              "inputs" => [%{"name" => "x", "type" => "uint256"}],
              "name" => "set",
              "outputs" => [],
              "payable" => false,
              "stateMutability" => "nonpayable",
              "type" => "function"
            },
            %{
              "constant" => true,
              "inputs" => [],
              "name" => "get",
              "outputs" => [%{"name" => "", "type" => "uint256"}],
              "payable" => false,
              "stateMutability" => "view",
              "type" => "function"
            }
          ],
          "bytecode" => "608060405234801561001057600080fd5b5060df8061001f6000396000f3006080604052600436106049576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff16806360fe47b114604e5780636d4ce63c146078575b600080fd5b348015605957600080fd5b5060766004803603810190808035906020019092919050505060a0565b005b348015608357600080fd5b50608a60aa565b6040518082815260200191505060405180910390f35b8060008190555050565b600080549050905600a165627a7a72305820834bdab406d80509618957aa1a5ad1a4b77f4f1149078675940494ebe5b4147b0029",
          "name" => "SimpleStorage"
        }
      }
  """
  @spec run(Keyword.t()) :: {:ok, map} | {:error, :compilation | :name}
  def run(params) do
    name = Keyword.fetch!(params, :name)
    # compiler_version = Keyword.fetch!(params, :compiler_version)
    code = Keyword.fetch!(params, :code)
    optimize = Keyword.fetch!(params, :optimize)
    optimization_runs = optimization_runs(params)
    external_libs = Keyword.get(params, :external_libs, %{})

    external_libs_string = Jason.encode!(external_libs)

    {response, _status} =
      System.cmd(
        "node",
        [
          Application.app_dir(:explorer, "priv/compile_solc.js"),
          create_source_file(code),
          optimize_value(optimize),
          optimization_runs,
          @new_contract_name,
          external_libs_string
        ]
      )

    with {:ok, decoded} <- Jason.decode(response),
         {:ok, contracts} <- get_contracts(decoded),
         %{"abi" => abi, "evm" => %{"bytecode" => %{"object" => bytecode}}} <-
           get_contract_info(contracts, name) do
      {:ok, %{"abi" => abi, "bytecode" => bytecode, "name" => name}}
    else
      {:error, %Jason.DecodeError{}} ->
        {:error, :compilation}

      {:error, reason} when reason in [:name, :compilation] ->
        {:error, reason}

      error ->
        error = parse_error(error)
        Logger.warn(["There was an error compiling a provided contract: ", inspect(error)])
        {:error, [first_error | _]} = error
        %{"message" => error_message} = first_error
        {:error, :compilation, error_message}
    end
  end

  def run(params, json_input) do
    name = Keyword.fetch!(params, :name)
    # compiler_version = Keyword.fetch!(params, :compiler_version)

    with {:ok, valid_json} <- tune_json(json_input),
         {response, _status} <-
           System.cmd(
             "node",
             [
               Application.app_dir(:explorer, "priv/compile_solc_standard_json_input.js"),
               create_source_file(valid_json)
             ]
           ),
         {:ok, decoded} <- Jason.decode(response),
         {:ok, contracts} <- get_contracts_standard_input_verification(decoded) do
      fetch_candidates(contracts, name)
    else
      {:error, %Jason.DecodeError{}} ->
        {:error, :compilation}

      {:error, reason} when reason in [:name, :compilation, :json] ->
        {:error, reason}

      error ->
        error = parse_error(error)
        Logger.warn(["There was an error compiling a provided contract: ", inspect(error)])
        {:error, [first_error | _]} = error
        %{"message" => error_message} = first_error
        {:error, :compilation, error_message}
    end
  end

  defp tune_json(json_input) when is_binary(json_input) do
    {:ok, dec} = Jason.decode(json_input)
    dec["input"] |> Jason.encode()
  end

  defp tune_json(_json_input), do: {:error, :json}

  defp fetch_candidates(contracts, "") when is_map(contracts) do
    candidates =
      for {file, content} <- contracts,
          {contract_name, %{"abi" => abi, "evm" => %{"bytecode" => %{"object" => bytecode}}}} <- content,
          do: %{"abi" => abi, "bytecode" => bytecode, "name" => contract_name, "file_path" => file}

    {:ok, candidates}
  end

  defp fetch_candidates(contracts, name) when is_binary(name) and is_map(contracts) do
    if String.contains?(name, ":") do
      [file_name, contract_name] = String.split(name, ":")
      fetch_candidates(contracts, file_name, contract_name)
    else
      candidates =
        for {file, content} <- contracts,
            {contract_name, %{"abi" => abi, "evm" => %{"bytecode" => %{"object" => bytecode}}}} <- content,
            contract_name == name,
            do: %{"abi" => abi, "bytecode" => bytecode, "name" => contract_name, "file_path" => file}

      {:ok, candidates}
    end
  end

  defp fetch_candidates(contracts, file_name, name)
       when is_binary(name) and is_binary(file_name) and is_map(contracts) do
    case contracts[file_name][name] do
      %{"abi" => abi, "evm" => %{"bytecode" => %{"object" => bytecode}}} ->
        {:ok, [%{"abi" => abi, "bytecode" => bytecode, "name" => name, "file_path" => file_name}]}

      _ ->
        {:ok, []}
    end
  end

  def get_contract_info(contracts, _) when contracts == %{}, do: {:error, :compilation}

  def get_contract_info(contracts, name) do
    new_versions_name = ":" <> name

    case contracts do
      %{^new_versions_name => response} ->
        response

      %{^name => response} ->
        response

      _ ->
        {:error, :name}
    end
  end

  def parse_error({:error, %{"error" => error}}), do: {:error, [error]}
  def parse_error({:error, %{"errors" => errors}}), do: {:error, errors}
  def parse_error({:error, _} = error), do: error

  # defp get_contracts(%{"contracts" => %{"*" => contracts}}), do: {:ok, contracts}
  # defp get_contracts(%{"contracts" => %{"" => contracts}}), do: {:ok, contracts}
  defp get_contracts(response) do
    firstKey = response["contracts"] |> Map.keys() |> Enum.at(0)
    test = response["contracts"][firstKey]
    {:ok, test}
  end

  defp get_contracts_standard_input_verification(%{"contracts" => contracts}), do: {:ok, contracts}
  defp get_contracts_standard_input_verification(response), do: {:error, response}

  defp optimize_value(false), do: "0"
  defp optimize_value("false"), do: "0"

  defp optimize_value(true), do: "1"
  defp optimize_value("true"), do: "1"

  defp optimization_runs(params) do
    value = params |> Keyword.get(:optimization_runs, "200")

    if is_binary(value) do
      value
    else
      "#{value}"
    end
  end

  defp create_source_file(source) do
    {:ok, path} = Briefly.create()

    File.write!(path, source)

    path
  end
end
